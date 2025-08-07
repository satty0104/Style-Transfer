import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getDatabase, ref, push, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDHG35ruldGwrhxARuhxGeBJI0vL9032b8",
    authDomain: "styletransfer-cc0c6.firebaseapp.com",
    projectId: "styletransfer-cc0c6",
    storageBucket: "styletransfer-cc0c6.firebasestorage.app",
    messagingSenderId: "804840469743",
    appId: "1:804840469743:web:dc67b495404cf5ae87171a",
    measurementId: "G-LJZ995B6G8",
    databaseURL: "https://styletransfer-cc0c6-default-rtdb.firebaseio.com/"
  };


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const database = getDatabase(app);

// Make handleLogout available globally
window.handleLogout = async function() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error during logout. Please try again.');
    }
};

// Greetings in various Indian languages
const greetings = [
    { text: "नमस्ते", language: "Hindi" },
    { text: "வணக்கம்", language: "Tamil" },
    { text: "नमस्कार", language: "Marathi" },
    { text: "કેમ છો", language: "Gujarati" },
    { text: "নমস্কার", language: "Bengali" },
    { text: "ನಮಸ್ಕಾರ", language: "Kannada" },
    { text: "നമസ്കാരം", language: "Malayalam" },
    { text: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", language: "Punjabi" },
    { text: "नमस्कार", language: "Odia" },
    { text: "నమస్కారం", language: "Telugu" },
    { text: "Hello", language: "English" }
];

// Function to update greeting
function updateGreeting() {
    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
        const greeting = greetings[currentIndex];
        greetingElement.textContent = greeting.text;
        currentIndex = (currentIndex + 1) % greetings.length;
    }
}

// Function to check if user exists
async function checkUserExists(email) {
    try {
        console.log('Checking if user exists:', email);
        const response = await fetch(`http://127.0.0.1:5000/api/check-user/${encodeURIComponent(email)}`);
        if (!response.ok) {
            console.error('Failed to check user existence:', response.status);
            throw new Error('Failed to check user existence');
        }
        const data = await response.json();
        console.log('User exists check result:', data.exists);
        return data.exists;
    } catch (error) {
        console.error('Error checking user:', error);
        return false;
    }
}

// Function to handle registration
async function handleRegistration(name, email, password) {
    try {
        console.log('Starting registration process...');
        
        // First check if user exists in backend
        console.log('Checking if user exists in backend...');
        const userExists = await checkUserExists(email);
        if (userExists) {
            console.log('User already exists in backend');
            return {
                success: false,
                message: "This email is already registered. Please try logging in instead."
            };
        }
        
        // Then register with Firebase
        console.log('Registering with Firebase...');
        let userCredential;
        try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (firebaseError) {
            console.error('Firebase registration error:', firebaseError);
            if (firebaseError.code === 'auth/email-already-in-use') {
                return {
                    success: false,
                    message: "This email is already registered. Please try logging in instead."
                };
            }
            throw firebaseError;
        }
        
        const user = userCredential.user;
        console.log('Firebase registration successful, user:', user.uid);
        
        // Update user profile with name
        console.log('Updating user profile with name...');
        await updateProfile(user, {
            displayName: name
        });
        console.log('User profile updated successfully');

        // Register user in backend
        console.log('Registering with backend...');
        const response = await fetch('http://127.0.0.1:5000/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                email: email,
                password: password,
                uid: user.uid
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Backend registration failed:', errorData);
            
            // Only clean up Firebase if the error is not "email already registered"
            if (errorData.detail !== '400: Email already registered') {
                console.log('Cleaning up Firebase registration...');
                try {
                    await user.delete();
                    console.log('Firebase registration cleaned up successfully');
                } catch (deleteError) {
                    console.error('Error cleaning up Firebase registration:', deleteError);
                }
            } else {
                console.log('Email already registered in backend, keeping Firebase account');
            }
            
            throw new Error(errorData.detail || 'Registration failed');
        }

        const backendResponse = await response.json();
        console.log('Backend registration successful:', backendResponse);
        
        return { 
            success: true, 
            message: "Registration successful! You can now log in.",
            user: {
                name: name,
                email: email,
                uid: user.uid,
                ...backendResponse.user
            }
        };
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific Firebase errors
        if (error.code === 'auth/email-already-in-use') {
            console.log('Email already in use in Firebase');
            return { 
                success: false, 
                message: "This email is already registered. Please try logging in instead."
            };
        }
        
        if (error.code === 'auth/weak-password') {
            console.log('Weak password detected');
            return {
                success: false,
                message: "Password is too weak. Please use a stronger password."
            };
        }
        
        if (error.code === 'auth/invalid-email') {
            console.log('Invalid email format');
            return {
                success: false,
                message: "Invalid email address. Please enter a valid email."
            };
        }
        
        // Handle backend "email already registered" error
        if (error.message === '400: Email already registered') {
            return {
                success: false,
                message: "This email is already registered. Please try logging in instead."
            };
        }
        
        return { 
            success: false, 
            message: error.message || "Registration failed. Please try again."
        };
    }
}

// Function to update user information
async function updateUserInfo(user) {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/update-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: user.displayName,
                email: user.email,
                uid: user.uid,
                last_login: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update user information');
        }

        console.log('User information updated successfully');
    } catch (error) {
        console.error('Error updating user information:', error);
    }
}

// Function to add transformed image to user's history
async function addTransformedImage(userEmail, imagePath, styleName) {
    try {
        // Save to backend
        const response = await fetch('http://127.0.0.1:5000/api/add-transformed-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: userEmail,
                image_path: imagePath,
                style_name: styleName,
                transformed_at: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error('Failed to add transformed image to backend');
        }

        // Save to Firebase
        const user = auth.currentUser;
        if (user) {
            const userRef = ref(database, `users/${user.uid}/transformed_images`);
            const newImageRef = push(userRef);
            await set(newImageRef, {
                image_path: imagePath,
                style_name: styleName,
                transformed_at: new Date().toISOString()
            });
        }

        console.log('Transformed image added to history');
    } catch (error) {
        console.error('Error adding transformed image:', error);
    }
}

// Function to handle login
async function handleLogin(email, password) {
    try {
        console.log('Starting login process...');
        
        // First, login with Firebase
        console.log('Logging in with Firebase...');
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('Firebase login successful, user:', user.uid);
        
        // Store user info in sessionStorage immediately after Firebase login
        const userInfo = {
            name: user.displayName,
            email: user.email,
            uid: user.uid
        };
        console.log('Storing initial user info in sessionStorage');
        sessionStorage.setItem('user', JSON.stringify(userInfo));
        
        // Check if backend is available
        console.log('Attempting backend login...');
        try {
            const response = await fetch('http://127.0.0.1:5000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    uid: user.uid
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Backend login failed:', errorData);
                // Even if backend fails, we still have Firebase auth
                console.log('Continuing with Firebase auth only');
                return { 
                    success: true, 
                    message: "Logged in with Firebase (Backend temporarily unavailable)",
                    user: userInfo
                };
            }

            const backendResponse = await response.json();
            console.log('Backend login successful');
            
            // Update user information
            console.log('Updating user information...');
            await updateUserInfo(user);
            
            // Update session storage with backend data
            const updatedUserInfo = {
                ...userInfo,
                ...backendResponse.user
            };
            console.log('Updating session storage with backend data');
            sessionStorage.setItem('user', JSON.stringify(updatedUserInfo));
            
            return { 
                success: true, 
                message: backendResponse.message,
                user: updatedUserInfo
            };
        } catch (backendError) {
            console.error('Backend connection error:', backendError);
            // If backend is not available, still allow login with Firebase
            console.log('Continuing with Firebase auth only due to backend error');
            return {
                success: true,
                message: "Logged in with Firebase (Backend temporarily unavailable)",
                user: userInfo
            };
        }
    } catch (error) {
        console.error('Login error:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            console.log('Invalid credentials');
            return { 
                success: false, 
                message: "Invalid email or password. Please try again."
            };
        }
        return { 
            success: false, 
            message: error.message || "Login failed. Please try again."
        };
    }
}

// Initialize DOM elements
const loginModeToggle = document.getElementById('loginMode');
const formTitle = document.getElementById('formTitle');
const submitButton = document.getElementById('submitButton');
const toggleText = document.getElementById('toggleText');
const nameField = document.getElementById('name')?.parentElement;
const authForm = document.getElementById('authForm');

// Initialize greeting rotation
let currentIndex = 0;
if (document.getElementById('greeting')) {
    updateGreeting();
    setInterval(updateGreeting, 1000);
}

// Toggle between login and signup modes
if (loginModeToggle) {
    loginModeToggle.addEventListener('change', () => {
        const isLoginMode = loginModeToggle.checked;
        formTitle.textContent = isLoginMode ? 'Login' : 'Sign In';
        submitButton.textContent = isLoginMode ? 'Login' : 'Sign In';
        toggleText.textContent = isLoginMode ? 'Login Mode' : 'Sign In Mode';
        if (nameField) {
            nameField.style.display = isLoginMode ? 'none' : 'block';
            // Update name field requirement based on mode
            const nameInput = document.getElementById('name');
            if (nameInput) {
                nameInput.required = !isLoginMode;
                nameInput.name = isLoginMode ? '' : 'name';
            }
        }
    });
}

// Handle form submission
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const name = document.getElementById('name').value;
        const isLoginMode = loginModeToggle.checked;
        
        // Basic validation
        if (!email || !password || (!isLoginMode && !name)) {
            alert('Please fill in all required fields');
            return;
        }
        
        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address');
            return;
        }
        
        try {
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = isLoginMode ? 'Logging in...' : 'Signing up...';
            
            let result;
            if (isLoginMode) {
                result = await handleLogin(email, password);
            } else {
                result = await handleRegistration(name, email, password);
            }
            
            if (result.success) {
                // Store user info in sessionStorage
                sessionStorage.setItem('user', JSON.stringify(result.user));
                // Redirect to dashboard after successful authentication
                window.location.href = 'dashboard.html';
            } else {
                alert(result.message || 'Authentication failed. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please check your connection and try again.');
        } finally {
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = isLoginMode ? 'Login' : 'Sign In';
        }
    });
}

// Check authentication for dashboard
function checkAuth() {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            try {
                if (!user) {
                    // Check if we have user info in sessionStorage
                    const storedUser = sessionStorage.getItem('user');
                    if (storedUser) {
                        // Try to restore the session
                        try {
                            const userData = JSON.parse(storedUser);
                            console.log('Restoring session for user:', userData.email);
                            // Keep the session data
                            return resolve(userData);
                        } catch (error) {
                            console.error('Error restoring session:', error);
                            sessionStorage.removeItem('user');
                        }
                    }
                    console.log('No user found, redirecting to login');
                    window.location.href = 'index.html';
                    return;
                }
                
                // Update user name in dashboard
                const userNameElement = document.getElementById('userName');
                const welcomeNameElement = document.getElementById('welcomeName');
                
                if (userNameElement) {
                    userNameElement.textContent = user.displayName || 'User';
                }
                if (welcomeNameElement) {
                    welcomeNameElement.textContent = user.displayName || 'User';
                }

                // Store user info in sessionStorage
                const userInfo = {
                    name: user.displayName,
                    email: user.email,
                    uid: user.uid
                };
                console.log('Storing user info in sessionStorage:', userInfo);
                sessionStorage.setItem('user', JSON.stringify(userInfo));
                
                resolve(user);
            } catch (error) {
                console.error('Error updating user data:', error);
                reject(error);
            }
        });
        
        // Cleanup subscription after 10 seconds to prevent hanging
        setTimeout(() => {
            unsubscribe();
        }, 10000);
    });
}

// Style transfer functionality
let selectedStyle = null;
let targetImage = null;
let customStyleImage = null;

// Predefined styles
const predefinedStyles = [
    {
        id: 'style_1',
        name: 'Style 1',
        image: './styles/style_1.jpg',
        description: 'Classic artistic style'
    },
    {
        id: 'style_2',
        name: 'Style 2',
        image: './styles/style_2.png',
        description: 'Modern artistic style'
    },
    {
        id: 'style_3',
        name: 'Style 3',
        image: './styles/style_3.jpeg',
        description: 'Contemporary artistic style'
    }
];

// Initialize style selection
function initializeStyleSelection() {
    const styleButtons = document.querySelectorAll('.style-button');
    const styleContents = document.querySelectorAll('.style-content');

    // Handle style button clicks
    styleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            styleButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show corresponding content
            const option = button.dataset.option;
            styleContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === option + 'Styles' || content.id === option + 'Style') {
                    content.classList.add('active');
                }
            });

            // Reset selected style when switching options
            selectedStyle = null;
            updateTransformButton();
        });
    });

    // Initialize predefined styles
    const predefinedStylesContainer = document.querySelector('#predefinedStyles .style-grid');
    if (predefinedStylesContainer) {
        predefinedStyles.forEach(style => {
            const styleItem = document.createElement('div');
            styleItem.className = 'style-item';
            styleItem.dataset.styleId = style.id;
            styleItem.innerHTML = `
                <img src="${style.image}" alt="${style.name}">
                <div class="style-item-info">
                    <p>${style.name}</p>
                    <span>${style.description}</span>
                </div>
            `;
            styleItem.addEventListener('click', () => {
                // Remove selection from all items
                document.querySelectorAll('.style-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // Select this style
                styleItem.classList.add('selected');
                selectedStyle = style;
                // Enable transform button if target image is uploaded
                updateTransformButton();
            });
            predefinedStylesContainer.appendChild(styleItem);
        });
    }

    // Initialize custom style upload
    initializeCustomStyleUpload();
}

// Utility function to prevent default event behavior
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Handle custom style upload
function initializeCustomStyleUpload() {
    const customStyleUpload = document.getElementById('customStyleUpload');
    const styleUpload = document.getElementById('styleUpload');
    const uploadStyleBtn = document.querySelector('.upload-style-btn');
    const customStyleOptions = document.getElementById('customStyleOptions');

    // Handle click on upload button
    if (uploadStyleBtn) {
        uploadStyleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering upload area click
            styleUpload.click();
        });
    }

    // Handle click on upload area
    if (customStyleUpload) {
        customStyleUpload.addEventListener('click', () => {
            styleUpload.click();
        });
    }

    // Handle file selection
    if (styleUpload) {
        styleUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleStyleFile(e.target.files[0]);
            }
        });
    }

    // Handle drag and drop
    if (customStyleUpload) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            customStyleUpload.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            customStyleUpload.addEventListener(eventName, () => {
                customStyleUpload.classList.add('highlight');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            customStyleUpload.addEventListener(eventName, () => {
                customStyleUpload.classList.remove('highlight');
            }, false);
        });

        customStyleUpload.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0) {
                handleStyleFile(files[0]);
            }
        }, false);
    }
}

// Handle custom style file
function handleStyleFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please upload an image file');
        return;
    }

    const customStyleOptions = document.getElementById('customStyleOptions');
    const reader = new FileReader();

    reader.onload = (e) => {
        // Create style item
        const styleItem = document.createElement('div');
        styleItem.className = 'style-item selected';
        styleItem.innerHTML = `
            <img src="${e.target.result}" alt="Custom Style">
            <div class="style-item-info">
                <p>Custom Style</p>
                <span>Your uploaded style</span>
            </div>
        `;
        
        // Clear previous options and add new one
        if (customStyleOptions) {
            customStyleOptions.innerHTML = '';
            customStyleOptions.appendChild(styleItem);
            customStyleOptions.style.display = 'grid';
        }
        
        // Update selected style
        selectedStyle = {
            id: 'custom',
            name: 'Custom Style',
            image: e.target.result,
            description: 'Your custom style'
        };
        
        // Enable transform button if target image is uploaded
        updateTransformButton();
    };

    reader.readAsDataURL(file);
}

// Initialize target image upload
function initializeTargetImageUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.querySelector('.upload-btn');

    // Handle click on upload area
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // Handle click on upload button
    if (uploadBtn) {
        uploadBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering upload area click
            fileInput.click();
        });
    }

    // Handle file selection
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const targetPreview = document.getElementById('targetPreview');
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    targetPreview.innerHTML = `<img src="${e.target.result}" alt="Target Image">`;
                    targetPreview.classList.remove('empty');
                    targetImage = e.target.result;
                    console.log('Target image loaded successfully');
                    
                    // Enable transform button if style is selected
                    updateTransformButton();
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Handle drag and drop
    if (uploadArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.add('highlight');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadArea.addEventListener(eventName, () => {
                uploadArea.classList.remove('highlight');
            }, false);
        });

        uploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files.length > 0) {
                const file = files[0];
                const targetPreview = document.getElementById('targetPreview');
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    targetPreview.innerHTML = `<img src="${e.target.result}" alt="Target Image">`;
                    targetPreview.classList.remove('empty');
                    targetImage = e.target.result;
                    console.log('Target image loaded successfully');
                    
                    // Enable transform button if style is selected
                    updateTransformButton();
                };
                reader.readAsDataURL(file);
            }
        }, false);
    }
}

// Update transform button state
function updateTransformButton() {
    const transformBtn = document.getElementById('transformBtn');
    if (transformBtn) {
        const isEnabled = selectedStyle && targetImage;
        transformBtn.disabled = !isEnabled;
        console.log('Transform button state updated:', {
            isEnabled,
            hasStyle: !!selectedStyle,
            hasTarget: !!targetImage
        });
    }
}

// Add transform button click handler
document.getElementById('transformBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (!targetImage || !selectedStyle) {
        showError('Please select both a target image and a style');
        return;
    }

    try {
        // Convert base64 to File objects
        const contentFile = await fetch(targetImage).then(r => r.blob());
        const styleFile = await fetch(selectedStyle.image).then(r => r.blob());

        // Create File objects with proper names
        const contentFileObj = new File([contentFile], 'content.jpg', { type: 'image/jpeg' });
        const styleFileObj = new File([styleFile], 'style.jpg', { type: 'image/jpeg' });

        // Call transferStyle function
        await transferStyle(contentFileObj, styleFileObj);
    } catch (error) {
        console.error('Error during transform:', error);
        showError('Failed to transform image. Please try again.');
    }
});

// Style transfer function
async function transferStyle(contentFile, styleFile) {
    try {
        const userEmail = getCurrentUserEmail();
        if (!userEmail) {
            showError('Please login to continue');
            return;
        }

        // Show loading state
        const transformBtn = document.getElementById('transformBtn');
        const originalButtonText = transformBtn.innerHTML;
        transformBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transforming...';
        transformBtn.disabled = true;

        // Show loading overlay
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }

        // Generate a unique client ID for this transfer
        const clientId = 'client_' + Date.now();

        // Connect to WebSocket for progress updates
        const ws = new WebSocket(`ws://127.0.0.1:5000/ws/${clientId}`);
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            if (data.completed) {
                // Hide loading overlay
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
                
                // Reset transform button
                transformBtn.innerHTML = originalButtonText;
                transformBtn.disabled = false;
                
                // Show the transformed image
                const resultImage = document.getElementById('resultImage');
                if (resultImage) {
                    resultImage.src = data.image_data.path;
                    resultImage.style.display = 'block';
                }
                
                // Add the new image to gallery immediately
                addImageToGallery(data.image_data);
                
                // Reload gallery to ensure all images are shown
                loadGallery();
            } else {
                // Update progress
                const progressBar = document.getElementById('progressBar');
                const progressText = document.getElementById('progressText');
                if (progressBar && progressText) {
                    progressBar.style.width = `${data.percentage}%`;
                    progressText.textContent = `Transforming: ${Math.round(data.percentage)}%`;
                }
            }
        };

        // Create form data
        const formData = new FormData();
        formData.append('content', contentFile);
        formData.append('style', styleFile);
        formData.append('email', userEmail);
        formData.append('client_id', clientId);

        // Send request to backend
        const response = await fetch('http://127.0.0.1:5000/api/transfer', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Style transfer failed');
        }

    } catch (error) {
        console.error('Error during style transfer:', error);
        showError('Failed to transform image. Please try again.');
        
        // Reset UI state
        const transformBtn = document.getElementById('transformBtn');
        if (transformBtn) {
            transformBtn.innerHTML = originalButtonText;
            transformBtn.disabled = false;
        }
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
}

// Function to add a single image to gallery
function addImageToGallery(imageData) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) return;

    const galleryItem = createGalleryItem(imageData);
    galleryGrid.insertBefore(galleryItem, galleryGrid.firstChild);
}

// Function to create a gallery item
function createGalleryItem(imageData) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    // Ensure we have valid timestamps
    const timestamp = imageData.transformed_at || imageData.timestamp || new Date().toISOString();
    const date = new Date(timestamp);
    const formattedDate = date.toLocaleDateString();
    const formattedTime = date.toLocaleTimeString();
    
    // Ensure we have valid paths
    const imagePath = imageData.thumbnail_path || imageData.path || '';
    const filename = imageData.original_filename || imageData.filename || 'Untitled';
    
    item.innerHTML = `
        <img src="${imagePath}" alt="${filename}" loading="lazy" onerror="this.src='placeholder.jpg'">
        <div class="gallery-item-info">
            <h3 class="gallery-item-title">${filename}</h3>
            <p class="gallery-item-meta">
                <span>${formattedDate} ${formattedTime}</span>
                <span>${formatFileSize(imageData.size || 0)}</span>
            </p>
            <div class="gallery-item-actions">
                <button onclick="downloadImage('${imageData.path}')" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download
                </button>
                <button onclick="deleteImage('${imageData.filename}')" class="btn btn-danger">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
    
    return item;
}

// Function to load gallery
async function loadGallery() {
    try {
        const userEmail = getCurrentUserEmail();
        if (!userEmail) {
            console.error('No user email found');
            showError('Please login to view gallery');
            return;
        }

        console.log('Loading gallery for user:', userEmail);
        const apiUrl = `http://127.0.0.1:5000/api/gallery/${encodeURIComponent(userEmail)}?page=${currentPage}&per_page=20`;
        console.log('Fetching gallery from:', apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gallery API error:', errorData);
            throw new Error(errorData.detail || 'Failed to load gallery');
        }

        const data = await response.json();
        console.log('Gallery data received:', data);
        
        const galleryGrid = document.getElementById('galleryGrid');
        if (!galleryGrid) {
            console.error('Gallery grid element not found');
            return;
        }

        // Clear existing items
        galleryGrid.innerHTML = '';

        if (!data.images || data.images.length === 0) {
            console.log('No images found in gallery');
            galleryGrid.innerHTML = `
                <div class="no-images-message">
                    <p>No images in your gallery yet.</p>
                    <p>Try transforming some images to see them here!</p>
                </div>
            `;
            return;
        }

        // Add new items
        data.images.forEach(imageData => {
            const galleryItem = createGalleryItem(imageData);
            galleryGrid.appendChild(galleryItem);
        });

        // Update pagination
        updatePagination(data.pagination);

    } catch (error) {
        console.error('Error loading gallery:', error);
        
        // Show specific error messages based on error type
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            showError('Failed to connect to server. Please check if the server is running.');
        } else if (error.message.includes('No user email found')) {
            showError('Please login to view gallery');
        } else {
            showError('Failed to load gallery. Please try refreshing the page.');
        }
    }
}

// Initialize gallery when dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('galleryGrid')) {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    await loadGallery();
                } catch (error) {
                    console.error('Error initializing gallery:', error);
                    showError('Failed to load gallery. Please try refreshing the page.');
                }
            } else {
                console.log('No user signed in, redirecting to login page...');
                window.location.href = 'index.html';
            }
        });
        
        // Cleanup listener after 10 seconds
        setTimeout(() => {
            unsubscribe();
        }, 10000);
    }
});

// Gallery Management
let currentPage = 1;
let totalPages = 1;
let currentSort = 'newest';
let currentSearch = '';

// Update pagination controls
function updatePagination(pagination) {
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    currentPage = pagination.current_page;
    totalPages = pagination.total_pages;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

// Make functions globally available
window.deleteImage = async function(filename) {
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
        const userEmail = getCurrentUserEmail();
        const response = await fetch(`http://127.0.0.1:5000/api/images/${userEmail}/${filename}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete image');

        await loadGallery();
        showSuccess('Image deleted successfully');
    } catch (error) {
        console.error('Error deleting image:', error);
        showError('Failed to delete image');
    }
};

window.downloadImage = async function(imagePath) {
    try {
        const response = await fetch(imagePath);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = imagePath.split('/').pop();
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading image:', error);
        showError('Failed to download image');
    }
};

// Utility functions
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show error message
function showError(message) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div class="error-message">
                <p>${message}</p>
                <button onclick="window.location.reload()" class="btn btn-primary">Retry</button>
            </div>
        `;
    } else {
        console.error('Error message:', message);
    }
}

// Show success message
function showSuccess(message) {
    // You can implement a toast notification or other success message display
    console.log('Success:', message);
}

// Get current user's email
function getCurrentUserEmail() {
    const user = auth.currentUser;
    if (!user) {
        console.error('No user is currently signed in');
        return null;
    }
    return user.email;
}

// Initialize dashboard if on dashboard page
if (document.getElementById('userName')) {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            console.log('Initializing dashboard...');
            const user = await checkAuth();
            if (user) {
                console.log('User authenticated, initializing dashboard features');
                initializeStyleSelection();
                initializeTargetImageUpload();
                loadGallery();
            }
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            // Don't redirect on error, just show error message
            showError('Error initializing dashboard. Please try refreshing the page.');
        }
    });
}
