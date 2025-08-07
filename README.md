# 🖼️ Neural Style Transfer Web App

This is a full-stack web application that performs **Neural Style Transfer** — a deep learning technique that blends a content image with a style image to produce a unique, artistic result. Users can either choose from a collection of **preloaded artistic styles** or upload their own style image.

---

## 🌐 Tech Stack

### 🔸 Frontend
- **HTML**, **CSS**, **JavaScript**  
- Responsive user interface for image uploads, preview, and download of stylized images

### 🔸 Backend
- **FastAPI** for serving the style transfer model
- API endpoints to accept image uploads and return stylized results

### 🔸 Deep Learning
- **PyTorch** implementation of Neural Style Transfer
- Based on the optimization technique from the original NST paper (Gatys et al.)

### 🔸 Database
- **Firebase Realtime Database** to store session logs, image references, or metadata

---

## 🚀 Features

- ✅ Upload your own **content image**
- ✅ Choose from a set of **preloaded artistic styles** 
- ✅ Or **upload a custom style image**
- ✅ Stylize the content using the selected style
- ✅ View and download the result
- ✅ Firebase integration for tracking user sessions or storing data

---

## 🔥 Firebase Setup Instructions

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Copy the Firebase config and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);


```

## 🚀 Deployment on Render

### Prerequisites

- Render account
- GitHub repository with your code

### Deployment Steps

1. **Push your code to GitHub**

2. **Connect to Render:**
   - Go to [render.com](https://render.com)
   - Sign up/Login
   - Click "New +" and select "Web Service"

3. **Configure the service:**
   - **Name:** style-transfer-app
   - **Environment:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`

4. **Environment Variables (Optional):**
   - `PYTHON_VERSION`: 3.11.0

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your application

### Alternative: Using render.yaml

If you prefer using the `render.yaml` file:

1. Push your code with the `render.yaml` file
2. In Render dashboard, select "New +" → "Blueprint"
3. Connect your GitHub repository
4. Render will automatically detect and use the `render.yaml` configuration

### Notes for Render Deployment

- The application uses CPU-only PyTorch for Render compatibility
- File uploads are stored locally (consider using cloud storage for production)
- User data is stored in JSON format (consider using a proper database for production)
- Render's free tier has memory limits - consider upgrading for larger models

### Troubleshooting

1. **Build fails on Render:**
   - Check that all dependencies are in `requirements.txt`
   - Ensure Python version is compatible

2. **Application crashes:**
   - Check logs in Render dashboard
   - Verify all required directories exist

3. **Memory issues:**
   - Render's free tier has memory limits
   - Consider upgrading to a paid plan for larger models
