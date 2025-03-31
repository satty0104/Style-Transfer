# app.py - Flask Backend for Style Transfer
import os
from datetime import datetime
from flask import Flask, request, send_file
from io import BytesIO
from PIL import Image
import torch
from torchvision import models, transforms
import torch.optim as optim
import numpy as np

app = Flask(__name__)

os.makedirs("outputs", exist_ok=True)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
vgg = models.vgg19(pretrained=True).features.to(device).eval()
for param in vgg.parameters():
    param.requires_grad_(False)

def load_image_from_memory(img_data, max_size=128, shape=None):
    image = Image.open(img_data).convert('RGB')
    size = max_size if max(image.size) > max_size else max(image.size)
    if shape is not None:
        size = shape

    in_transform = transforms.Compose([
        transforms.Resize(size),
        transforms.ToTensor(),
        transforms.Normalize((0.485, 0.456, 0.406),
                             (0.229, 0.224, 0.225))
    ])
    image = in_transform(image)[:3, :, :].unsqueeze(0)
    return image.to(device)

def im_convert(tensor):
    image = tensor.to("cpu").clone().detach()
    image = image.numpy().squeeze()
    image = image.transpose(1, 2, 0)
    image = image * np.array((0.229, 0.224, 0.225)) + np.array((0.485, 0.456, 0.406))
    image = image.clip(0, 1)
    image = Image.fromarray((image * 255).astype('uint8'))
    return image

def get_features(image, model):
    layers = {'0': 'conv1_1', '5': 'conv2_1', '10': 'conv3_1',
              '19': 'conv4_1', '21': 'conv4_2', '28': 'conv5_1'}
    features = {}
    x = image
    for name, layer in model._modules.items():
        x = layer(x)
        if name in layers:
            features[layers[name]] = x
    return features

def gram_matrix(tensor):
    _, d, h, w = tensor.size()
    tensor = tensor.view(d, h * w)
    gram = torch.mm(tensor, tensor.t())
    return gram

@app.route('/api/style-transfer', methods=['POST'])
def style_transfer():
    input_image = request.files['input']
    style_image = request.files['style']

    print("[INFO] Loading and preprocessing images...")
    content = load_image_from_memory(input_image)
    style = load_image_from_memory(style_image, shape=content.shape[-2:])

    content_features = get_features(content, vgg)
    style_features = get_features(style, vgg)
    style_grams = {layer: gram_matrix(style_features[layer]) for layer in style_features}

    target = content.clone().requires_grad_(True).to(device)
    style_weights = {
        'conv1_1': 1.0,
        'conv2_1': 0.75,
        'conv3_1': 0.2,
        'conv4_1': 0.2,
        'conv5_1': 0.2
    }
    content_weight = 1e4
    style_weight = 1e2

    optimizer = optim.Adam([target], lr=0.003)
    steps = 200

    print("[INFO] Starting style transfer optimization...")
    for step in range(steps):
        target_features = get_features(target, vgg)
        content_loss = torch.mean((target_features['conv4_2'] - content_features['conv4_2']) ** 2)

        style_loss = 0
        for layer in style_weights:
            target_feature = target_features[layer]
            target_gram = gram_matrix(target_feature)
            style_gram = style_grams[layer]
            layer_style_loss = style_weights[layer] * torch.mean((target_gram - style_gram) ** 2)
            style_loss += layer_style_loss / (target_feature.shape[1]**2)

        total_loss = content_weight * content_loss + style_weight * style_loss
        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()

        if step % 50 == 0:
            print(f"[INFO] Step {step}/{steps} - Total Loss: {total_loss.item():.4f}")

    out_image = im_convert(target)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = f"outputs/stylized_{timestamp}.jpg"
    out_image.save(output_path)
    print(f"[INFO] Output saved to {output_path}")

    img_io = BytesIO()
    out_image.save(img_io, 'JPEG')
    img_io.seek(0)
    return send_file(img_io, mimetype='image/jpeg')

if __name__ == '__main__':
    app.run(port=5000, debug=True)
