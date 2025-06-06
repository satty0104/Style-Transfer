import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import transforms, models
from PIL import Image
import numpy as np
import requests
from io import BytesIO
import logging
import os
from datetime import datetime
import json

class StyleTransferModel:
    def __init__(self):
        # Get the root logger
        self.logger = logging.getLogger(__name__)
        
        # Initialize the model
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.vgg = models.vgg19(pretrained=True).features.to(self.device).eval()
        
        # Freeze all VGG parameters
        for param in self.vgg.parameters():
            param.requires_grad_(False)
        
        # Style and content layers
        self.layers = {
            '0': 'conv1_1',
            '5': 'conv2_1',
            '10': 'conv3_1',
            '19': 'conv4_1',
            '21': 'conv4_2',  # content representation
            '28': 'conv5_1'
        }
        
        # Style weights for different layers
        self.style_weights = {
            'conv1_1': 1,
            'conv2_1': 0.75,
            'conv3_1': 0.2,
            'conv4_1': 0.2,
            'conv5_1': 0.2
        }
        
        # Content and style weights
        self.content_weight = 1  # alpha
        self.style_weight = 1e3  # beta
        
        # Image transformation
        self.transform = transforms.Compose([
            transforms.Resize(128),  # max_size=128
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406),
                               (0.229, 0.224, 0.225))
        ])
        
        # Progress tracking
        self.current_progress = 0
        self.total_steps = 0
        self.progress_callback = None

    def set_progress_callback(self, callback):
        """Set a callback function for progress updates."""
        self.progress_callback = callback

    def update_progress(self, current, total, loss=None):
        """Update progress and log information."""
        self.current_progress = current
        self.total_steps = total
        
        if self.progress_callback:
            self.progress_callback(current, total, loss)
        
        if loss is not None:
            self.logger.info(f"Step {current}/{total} - Loss: {loss:.4f}")

    def load_image(self, img_path, max_size=128, shape=None):
        """Load in and transform an image."""
        try:
            if "http" in img_path:
                response = requests.get(img_path)
                image = Image.open(BytesIO(response.content)).convert('RGB')
                self.logger.info(f"Loaded image from URL: {img_path}")
            else:
                image = Image.open(img_path).convert('RGB')
                self.logger.info(f"Loaded image from file: {img_path}")

            # Resize large images
            if max(image.size) > max_size:
                size = max_size
            else:
                size = max(image.size)

            if shape is not None:
                size = shape

            image = self.transform(image)[:3,:,:].unsqueeze(0)
            return image.to(self.device)
        except Exception as e:
            self.logger.error(f"Error loading image: {str(e)}")
            raise

    def get_features(self, image, layers=None):
        """Run an image forward through a model and get the features for a set of layers."""
        if layers is None:
            layers = self.layers

        features = {}
        x = image
        for name, layer in self.vgg._modules.items():
            x = layer(x)
            if name in layers:
                features[layers[name]] = x

        return features

    def gram_matrix(self, tensor):
        """Calculate the Gram Matrix of a given tensor."""
        _, d, h, w = tensor.size()
        tensor = tensor.view(d, h * w)
        gram = torch.mm(tensor, tensor.t())
        return gram

    def transfer_style(self, content_path, style_path, num_steps=500):
        """Perform style transfer between content and style images."""
        try:
            self.logger.info(f"Starting style transfer process")
            self.logger.info(f"Content image: {content_path}")
            self.logger.info(f"Style image: {style_path}")
            self.logger.info(f"Number of steps: {num_steps}")

            # Load images
            content = self.load_image(content_path)
            style = self.load_image(style_path)
            
            # Get content and style features
            content_features = self.get_features(content)
            style_features = self.get_features(style)
            
            # Calculate gram matrices for style features
            style_grams = {layer: self.gram_matrix(style_features[layer]) 
                          for layer in style_features}
            
            # Initialize target image
            target = content.clone().requires_grad_(True).to(self.device)
            
            # Initialize optimizer
            optimizer = optim.Adam([target], lr=0.003)
            
            # Run style transfer
            for ii in range(1, num_steps + 1):
                # Get target features
                target_features = self.get_features(target)
                
                # Calculate content loss
                content_loss = torch.mean((target_features['conv4_2'] - 
                                         content_features['conv4_2'])**2)
                
                # Calculate style loss
                style_loss = 0
                for layer in self.style_weights:
                    target_feature = target_features[layer]
                    target_gram = self.gram_matrix(target_feature)
                    _, d, h, w = target_feature.shape
                    style_gram = style_grams[layer]
                    layer_style_loss = self.style_weights[layer] * torch.mean(
                        (target_gram - style_gram)**2)
                    style_loss += layer_style_loss / (d * h * w)
                
                # Calculate total loss
                total_loss = self.content_weight * content_loss + self.style_weight * style_loss
                
                # Update target image
                optimizer.zero_grad()
                total_loss.backward()
                optimizer.step()
                
                # Clamp the values
                target.data.clamp_(0, 1)
                
                # Update progress every step
                self.update_progress(ii, num_steps, total_loss.item())
            
            # Convert to PIL Image
            image = target.to("cpu").clone().detach()
            image = image.numpy().squeeze()
            image = image.transpose(1, 2, 0)
            image = image * np.array((0.229, 0.224, 0.225)) + np.array((0.485, 0.456, 0.406))
            image = image.clip(0, 1)
            image = Image.fromarray((image * 255).astype(np.uint8))
            
            self.logger.info("Style transfer completed successfully")
            return image
            
        except Exception as e:
            self.logger.error(f"Error during style transfer: {str(e)}")
            raise 