import os
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from tinydb import TinyDB, Query
from model import StyleTransferModel
import logging
from datetime import datetime
from typing import Optional, Dict, List
import uvicorn
from pydantic import BaseModel
import json
import asyncio
import traceback
from PIL import Image

# App setup
app = FastAPI()

# CORS setup with more specific configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Logging setup
def setup_logging():
    os.makedirs('logs', exist_ok=True)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_formatter = logging.Formatter('%(levelname)s - %(message)s')
    log_file = f'logs/app_{datetime.now().strftime("%Y%m%d")}.log'
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(file_formatter)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    return root_logger

logger = setup_logging()

# Directories
UPLOAD_FOLDER = 'uploads'
STYLE_FOLDER = 'styles'
OUTPUT_FOLDER = 'outputs'
for folder in [UPLOAD_FOLDER, STYLE_FOLDER, OUTPUT_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# Mount static directories
app.mount("/outputs", StaticFiles(directory=OUTPUT_FOLDER), name="outputs")

# Initialize database
db = TinyDB('users.json')
UserQuery = Query()

model = StyleTransferModel()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.transfer_status: Dict[str, bool] = {}
        self.transfer_complete: Dict[str, bool] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        try:
            await websocket.accept()
            self.active_connections[client_id] = websocket
            self.transfer_status[client_id] = False
            self.transfer_complete[client_id] = False
            logger.info(f"WebSocket connection established for client {client_id}. Active connections: {len(self.active_connections)}")
            return True
        except Exception as e:
            logger.error(f"Error establishing WebSocket connection for client {client_id}: {str(e)}")
            return False

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            if client_id in self.transfer_status:
                del self.transfer_status[client_id]
            if client_id in self.transfer_complete:
                del self.transfer_complete[client_id]
            logger.info(f"WebSocket connection closed for client {client_id}. Active connections: {len(self.active_connections)}")

    async def send_progress(self, client_id: str, progress: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(progress)
                if progress.get('completed', False):
                    self.transfer_complete[client_id] = True
                    logger.info(f"Transfer marked as complete for client {client_id}")
            except Exception as e:
                logger.error(f"Error sending progress to client {client_id}: {str(e)}")
                self.disconnect(client_id)

manager = ConnectionManager()

# WebSocket endpoint for progress updates
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    logger.info(f"Attempting to establish WebSocket connection for client {client_id}")
    connected = await manager.connect(websocket, client_id)
    if not connected:
        return

    try:
        while True:
            try:
                data = await websocket.receive_text()
                logger.debug(f"Received message from client {client_id}: {data}")
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected normally for client {client_id}")
                break
            except Exception as e:
                logger.error(f"WebSocket error for client {client_id}: {str(e)}")
                break
    finally:
        # Only disconnect if the transfer is complete
        if client_id in manager.transfer_complete and manager.transfer_complete[client_id]:
            logger.info(f"Transfer completed, closing WebSocket for client {client_id}")
            manager.disconnect(client_id)
        else:
            logger.warning(f"WebSocket disconnected before transfer completion for client {client_id}")

def progress_callback(current, total, loss, client_id):
    progress = {
        'current': current,
        'total': total,
        'loss': loss,
        'percentage': (current / total) * 100
    }
    # We'll handle this asynchronously in the WebSocket endpoint
    asyncio.create_task(manager.send_progress(client_id, progress))
    return progress

# Pydantic models for request validation
class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    uid: str

class UserLogin(BaseModel):
    email: str
    password: str
    uid: str

class ImageMetadata(BaseModel):
    filename: str
    original_filename: str
    path: str
    thumbnail_path: str
    timestamp: str
    style_used: str
    is_original: bool
    size: int
    dimensions: dict
    tags: List[str] = []

# Helper functions for image management
def create_user_image_directories(email: str):
    """Create user-specific directories for images"""
    user_uploads = os.path.join(UPLOAD_FOLDER, email)
    user_outputs = os.path.join(OUTPUT_FOLDER, email)
    user_thumbnails = os.path.join(OUTPUT_FOLDER, email, 'thumbnails')
    
    for directory in [user_uploads, user_outputs, user_thumbnails]:
        os.makedirs(directory, exist_ok=True)
    
    return user_uploads, user_outputs, user_thumbnails

def create_thumbnail(image_path: str, thumbnail_path: str, size: tuple = (200, 200)):
    """Create a thumbnail version of the image"""
    try:
        with Image.open(image_path) as img:
            img.thumbnail(size)
            img.save(thumbnail_path, quality=85, optimize=True)
        return True
    except Exception as e:
        logger.error(f"Error creating thumbnail: {str(e)}")
        return False

def get_image_metadata(image_path: str) -> dict:
    """Get metadata for an image"""
    try:
        with Image.open(image_path) as img:
            return {
                'size': os.path.getsize(image_path),
                'dimensions': {
                    'width': img.width,
                    'height': img.height
                }
            }
    except Exception as e:
        logger.error(f"Error getting image metadata: {str(e)}")
        return {
            'size': 0,
            'dimensions': {'width': 0, 'height': 0}
        }

@app.post("/api/register")
async def register_user(user: UserRegister):
    try:
        logger.info(f"Received registration request for: {user.email}")
        
        # Load existing users
        users_data = load_users()
        
        # Check if user already exists
        for existing_user in users_data["users"]:
            if existing_user["email"] == user.email:
                logger.warning(f"Attempt to register existing email: {user.email}")
                raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create new user record
        new_user = {
            'name': user.name,
            'email': user.email,
            'uid': user.uid,
            'is_verified': False,
            'created_at': datetime.now().isoformat(),
            'last_login': datetime.now().isoformat(),
            'transformed_images': []
        }
        
        # Add new user to the list
        users_data["users"].append(new_user)
        
        # Save updated users data
        save_users(users_data)
        
        logger.info(f"User registered successfully: {user.email}")
        return {"message": "User registered successfully", "user": new_user}
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/check-user/{email}")
async def check_user(email: str):
    exists = bool(db.get(UserQuery.email == email))
    return {"exists": exists}

@app.post("/api/login")
async def login_user(user: UserLogin):
    try:
        logger.info(f"Received login request for: {user.email}")
        
        db_user = db.get(UserQuery.email == user.email)
        
        if not db_user:
            # Create new user record if not exists
            user_data = {
                'email': user.email,
                'uid': user.uid,
                'is_verified': True,
                'created_at': datetime.now().isoformat(),
                'last_login': datetime.now().isoformat(),
                'images': []
            }
            db.insert(user_data)
            logger.info(f"New user logged in: {user.email}")
            return {
                "success": True,
                "message": "Login successful!",
                "user": user_data
            }
        
        # Update last login time
        db.update({
            'last_login': datetime.now().isoformat()
        }, UserQuery.email == user.email)
        
        logger.info(f"User logged in: {user.email}")
        return {
            "success": True,
            "message": f"Welcome {db_user.get('name', 'User')}!",
            "user": db_user
        }
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/gallery/{email}")
async def get_gallery(email: str, page: int = 1, per_page: int = 20):
    """Get user's image gallery with pagination"""
    try:
        users_data = load_users()
        user = next((u for u in users_data["users"] if u["email"] == email), None)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Use transformed_images instead of images
        images = user.get("transformed_images", [])
        total_images = len(images)
        
        # Calculate pagination
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        # Sort images by timestamp (newest first)
        sorted_images = sorted(images, key=lambda x: x.get("transformed_at", x.get("timestamp", "")), reverse=True)
        paginated_images = sorted_images[start_idx:end_idx]
        
        return {
            "images": paginated_images,
            "pagination": {
                "current_page": page,
                "per_page": per_page,
                "total_images": total_images,
                "total_pages": (total_images + per_page - 1) // per_page
            }
        }
    except Exception as e:
        logger.error(f"Error fetching gallery: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/images/{email}/{filename}")
async def delete_image(email: str, filename: str):
    """Delete an image from user's gallery"""
    try:
        users_data = load_users()
        user = next((u for u in users_data["users"] if u["email"] == email), None)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Find the image in user's gallery
        image = next((img for img in user.get("transformed_images", []) if img["filename"] == filename), None)
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Delete the image files
        image_path = os.path.join(OUTPUT_FOLDER, email, filename)
        thumbnail_path = os.path.join(OUTPUT_FOLDER, email, 'thumbnails', f'thumb_{filename}')
        
        try:
            if os.path.exists(image_path):
                os.remove(image_path)
            if os.path.exists(thumbnail_path):
                os.remove(thumbnail_path)
        except Exception as e:
            logger.error(f"Error deleting image files: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to delete image files")
        
        # Remove image from user's gallery
        user["transformed_images"] = [img for img in user["transformed_images"] if img["filename"] != filename]
        save_users(users_data)
        
        return {"message": "Image deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/images/{email}/{filename}/tags")
async def update_image_tags(email: str, filename: str, tags: List[str]):
    """Update tags for an image"""
    try:
        users_data = load_users()
        user = next((u for u in users_data["users"] if u["email"] == email), None)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Find the image in user's gallery
        image = next((img for img in user.get("images", []) if img["filename"] == filename), None)
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Update tags
        image["tags"] = tags
        save_users(users_data)
        
        return {"message": "Tags updated successfully", "tags": tags}
    except Exception as e:
        logger.error(f"Error updating image tags: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/transfer")
async def transfer_style(
    content: UploadFile = File(...),
    style: UploadFile = File(...),
    email: str = Form(...),
    client_id: str = Form(...)
):
    try:
        logger.info(f"Starting style transfer process for user: {email}")
        
        # Create user-specific directories
        user_uploads, user_outputs, user_thumbnails = create_user_image_directories(email)
        
        # Validate file types
        if not content.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Content file must be an image")
        if not style.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Style file must be an image")

        # Create secure filenames with timestamps
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        content_filename = secure_filename(f"content_{timestamp}_{content.filename}")
        style_filename = secure_filename(f"style_{timestamp}_{style.filename}")
        
        content_path = os.path.join(user_uploads, content_filename)
        style_path = os.path.join(user_uploads, style_filename)
        
        # Save uploaded files
        try:
            content_data = await content.read()
            style_data = await style.read()
            
            with open(content_path, 'wb') as f:
                f.write(content_data)
            with open(style_path, 'wb') as f:
                f.write(style_data)
        except Exception as e:
            logger.error(f"Error saving uploaded files: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to save uploaded files")

        try:
            # Set the progress callback
            model.set_progress_callback(lambda current, total, loss: progress_callback(current, total, loss, client_id))
            
            # Perform style transfer
            output_image = model.transfer_style(content_path, style_path)
            
            # Generate output filename
            output_filename = f'result_{timestamp}_{os.path.splitext(content.filename)[0]}.jpg'
            output_path = os.path.join(user_outputs, output_filename)
            
            # Save the output image
            output_image.save(output_path)
            
            # Create thumbnail
            thumbnail_filename = f'thumb_{output_filename}'
            thumbnail_path = os.path.join(user_thumbnails, thumbnail_filename)
            create_thumbnail(output_path, thumbnail_path)
            
            # Get image metadata
            metadata = get_image_metadata(output_path)
            
            # Prepare image record
            image_record = {
                'filename': output_filename,
                'original_filename': content.filename,
                'path': f'/outputs/{email}/{output_filename}',
                'thumbnail_path': f'/outputs/{email}/thumbnails/{thumbnail_filename}',
                'transformed_at': datetime.now().isoformat(),
                'style_used': style.filename,
                'is_original': False,
                'size': metadata['size'],
                'dimensions': metadata['dimensions'],
                'tags': []
            }
            
            # Update user's image history
            users_data = load_users()
            for user in users_data["users"]:
                if user["email"] == email:
                    if "transformed_images" not in user:
                        user["transformed_images"] = []
                    user["transformed_images"].append(image_record)
                    break
            save_users(users_data)
            
            # Send final progress update
            await manager.send_progress(client_id, {
                'current': 100,
                'total': 100,
                'loss': 0,
                'percentage': 100,
                'completed': True,
                'image_data': image_record
            })
            
            return image_record
            
        except Exception as e:
            logger.error(f"Error during style transfer: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
            
    except Exception as e:
        logger.error(f"Style transfer error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/styles")
async def get_available_styles():
    try:
        styles = [f for f in os.listdir(STYLE_FOLDER) if f.endswith(('.png', '.jpg', '.jpeg'))]
        return {"success": True, "styles": styles}
    except Exception as e:
        logger.error(f"Error fetching styles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Load users from JSON file
def load_users():
    try:
        with open('users.json', 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"users": []}

# Save users to JSON file
def save_users(users_data):
    with open('users.json', 'w') as f:
        json.dump(users_data, f, indent=4)

@app.post("/api/update-user")
async def update_user(user_data: dict):
    try:
        logger.info(f"Updating user information for: {user_data['email']}")
        users_data = load_users()
        
        # Find if user exists
        user_exists = False
        for user in users_data["users"]:
            if user["email"] == user_data["email"]:
                # Update existing user
                user.update({
                    "name": user_data["name"],
                    "uid": user_data["uid"],
                    "last_login": user_data["last_login"]
                })
                user_exists = True
                logger.info(f"Updated existing user: {user_data['email']}")
                break
        
        # If user doesn't exist, add new user
        if not user_exists:
            new_user = {
                "name": user_data["name"],
                "email": user_data["email"],
                "uid": user_data["uid"],
                "last_login": user_data["last_login"],
                "transformed_images": []
            }
            users_data["users"].append(new_user)
            logger.info(f"Added new user: {user_data['email']}")
        
        # Save updated users data
        save_users(users_data)
        return {"message": "User information updated successfully"}
    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/add-transformed-image")
async def add_transformed_image(image_data: dict):
    try:
        logger.info(f"Adding transformed image for user: {image_data['email']}")
        users_data = load_users()
        
        # Find user
        user_found = False
        for user in users_data["users"]:
            if user["email"] == image_data["email"]:
                # Add transformed image to user's history
                if "transformed_images" not in user:
                    user["transformed_images"] = []
                
                user["transformed_images"].append({
                    "image_path": image_data["image_path"],
                    "style_name": image_data["style_name"],
                    "transformed_at": image_data["transformed_at"]
                })
                
                user_found = True
                logger.info(f"Added transformed image for user: {image_data['email']}")
                break
        
        if not user_found:
            logger.warning(f"User not found: {image_data['email']}")
            raise HTTPException(status_code=404, detail="User not found")
        
        # Save updated users data
        save_users(users_data)
        return {"message": "Transformed image added successfully"}
    except Exception as e:
        logger.error(f"Error adding transformed image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user-history/{email}")
async def get_user_history(email: str):
    try:
        users_data = load_users()
        
        # Find user
        for user in users_data["users"]:
            if user["email"] == email:
                return {
                    "name": user["name"],
                    "email": user["email"],
                    "last_login": user["last_login"],
                    "transformed_images": user.get("transformed_images", [])
                }
        
        raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        logger.error(f"Error getting user history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    try:
        import os
        port = int(os.environ.get("PORT", 5000))
        host = os.environ.get("HOST", "0.0.0.0")
        
        print(f"Starting FastAPI server...")
        print(f"Server will be available at http://{host}:{port}")
        uvicorn.run(
            "app:app",
            host=host,
            port=port,
            reload=False,  # Disable reload in production
            log_level="info"  # Use info level in production
        )
    except Exception as e:
        print(f"Error starting server: {str(e)}")
        raise
