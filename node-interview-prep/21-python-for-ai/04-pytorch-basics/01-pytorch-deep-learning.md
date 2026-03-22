# PyTorch Basics — Deep Learning in Python

## Tensors — The Core Data Structure

```python
import torch
import torch.nn as nn
import torch.optim as optim

# Creating tensors
t = torch.tensor([1.0, 2.0, 3.0])          # from Python list
t = torch.zeros(3, 4)                        # zeros
t = torch.ones(3, 4)
t = torch.randn(3, 4)                        # standard normal
t = torch.arange(0, 10, 2, dtype=torch.float32)

# Shapes (same concept as NumPy)
t.shape          # torch.Size([3, 4])
t.ndim           # 2
t.dtype          # torch.float32
t.device         # device(type='cpu')

# Move to GPU
device = "cuda" if torch.cuda.is_available() else "cpu"
t = t.to(device)

# dtype control (important for memory)
torch.float32    # 4 bytes — standard training
torch.float16    # 2 bytes — inference, mixed precision
torch.bfloat16   # 2 bytes — better range than float16
torch.int64      # 8 bytes

# NumPy interop
import numpy as np
arr = np.array([1, 2, 3])
t = torch.from_numpy(arr)   # shares memory
arr = t.numpy()             # back to numpy (CPU only)
```

---

## Autograd — Automatic Differentiation

```python
# requires_grad=True tells PyTorch to track operations for backprop
x = torch.tensor([2.0], requires_grad=True)
y = x ** 3 + 2 * x          # y = x³ + 2x
y.backward()                 # compute dy/dx
print(x.grad)                # dy/dx = 3x² + 2 = 14

# Disable gradient tracking (inference / eval)
with torch.no_grad():
    output = model(input)    # no gradients computed → faster, less memory

# Detach tensor from computation graph
t = some_tensor.detach()
t = some_tensor.detach().cpu().numpy()  # common pattern

# torch.inference_mode() — stricter than no_grad, fastest for inference
with torch.inference_mode():
    preds = model(X)
```

---

## Building Neural Networks

```python
# Simple feedforward network
class FeedForward(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, dropout: float = 0.1):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.layers(x)

model = FeedForward(input_dim=784, hidden_dim=256, output_dim=10)

# Check parameters
total_params = sum(p.numel() for p in model.parameters())
trainable    = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Total: {total_params:,}, Trainable: {trainable:,}")

# Common layers
nn.Linear(in, out)          # fully connected
nn.Conv2d(in_ch, out_ch, kernel_size)  # convolution
nn.LSTM(input_size, hidden_size)       # recurrent
nn.Embedding(vocab_size, embed_dim)   # lookup table
nn.LayerNorm(dim)
nn.BatchNorm1d(dim)
nn.Dropout(p=0.1)
nn.MultiheadAttention(embed_dim, num_heads)
```

---

## Training Loop

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

def train(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int = 10,
    lr: float = 1e-3,
    device: str = "cuda",
):
    model = model.to(device)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss()

    best_val_loss = float("inf")

    for epoch in range(epochs):
        # ── Training phase
        model.train()
        train_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)

            optimizer.zero_grad()            # clear gradients from last step
            preds = model(X_batch)           # forward pass
            loss = criterion(preds, y_batch) # compute loss
            loss.backward()                  # backprop — compute gradients
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)  # gradient clipping
            optimizer.step()                 # update weights

            train_loss += loss.item()

        # ── Validation phase
        model.eval()
        val_loss = 0.0
        correct = 0
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                preds = model(X_batch)
                val_loss += criterion(preds, y_batch).item()
                correct += (preds.argmax(1) == y_batch).sum().item()

        val_acc = correct / len(val_loader.dataset)
        print(f"Epoch {epoch+1}/{epochs} | Train: {train_loss/len(train_loader):.4f} | Val: {val_loss/len(val_loader):.4f} | Acc: {val_acc:.3f}")

        # Save best model
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), "best_model.pt")

        scheduler.step()

    # Load best weights
    model.load_state_dict(torch.load("best_model.pt"))
    return model
```

---

## Datasets & DataLoaders

```python
from torch.utils.data import Dataset, DataLoader
import pandas as pd

class TextDataset(Dataset):
    def __init__(self, texts: list[str], labels: list[int], tokenizer):
        self.encodings = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
        self.labels = torch.tensor(labels)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, idx: int) -> dict:
        item = {k: v[idx] for k, v in self.encodings.items()}
        item["labels"] = self.labels[idx]
        return item

dataset = TextDataset(texts, labels, tokenizer)
train_loader = DataLoader(
    dataset,
    batch_size=32,
    shuffle=True,
    num_workers=4,      # parallel data loading
    pin_memory=True,    # faster GPU transfer
    drop_last=True,     # drop incomplete last batch
)
```

---

## Transfer Learning & Fine-tuning

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

# Load pretrained model
model_name = "distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(
    model_name,
    num_labels=2  # binary classification
)

# Freeze all layers except the classifier head
for param in model.base_model.parameters():
    param.requires_grad = False  # freeze

# Only train the head
for param in model.classifier.parameters():
    param.requires_grad = True  # unfreeze

# Fine-tune
optimizer = optim.AdamW(
    filter(lambda p: p.requires_grad, model.parameters()),
    lr=2e-4
)

# Full fine-tuning (all layers, but different LRs)
optimizer = optim.AdamW([
    {"params": model.base_model.parameters(), "lr": 1e-5},    # low LR for pretrained
    {"params": model.classifier.parameters(), "lr": 1e-3},    # higher LR for new head
])
```

---

## Saving & Loading Models

```python
# Save (weights only — preferred)
torch.save(model.state_dict(), "model.pt")

# Load
model = MyModel(...)
model.load_state_dict(torch.load("model.pt", map_location="cpu"))
model.eval()

# Save entire model (less flexible)
torch.save(model, "full_model.pt")
loaded_model = torch.load("full_model.pt")

# HuggingFace save
model.save_pretrained("./my_model/")
tokenizer.save_pretrained("./my_model/")

# Reload
from transformers import AutoModelForSequenceClassification
model = AutoModelForSequenceClassification.from_pretrained("./my_model/")
```

---

## Memory Optimization

```python
# Mixed precision training (float16 forward pass, float32 for gradients)
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for X_batch, y_batch in train_loader:
    optimizer.zero_grad()

    with autocast():  # forward pass in float16
        preds = model(X_batch)
        loss = criterion(preds, y_batch)

    scaler.scale(loss).backward()   # scale loss to prevent underflow
    scaler.step(optimizer)
    scaler.update()

# Gradient checkpointing (trade compute for memory)
model.gradient_checkpointing_enable()

# Clear GPU cache
torch.cuda.empty_cache()

# Model in eval mode (no dropout, no gradient tracking)
model.eval()
with torch.no_grad():
    output = model(input)
```

---

## Interview Q&A

**Q: What is backpropagation?**

The algorithm that computes gradients of the loss with respect to every weight in the network, using the chain rule of calculus. Starting from the loss, it flows backward through each layer, computing how much each weight contributed to the error. These gradients are then used by the optimizer (SGD, Adam) to update weights in the direction that reduces loss.

**Q: What is the vanishing gradient problem?**

In deep networks, gradients are multiplied together as they flow backward through layers. With activation functions like sigmoid (output 0–1), many gradients multiplied together become very small (vanish), making early layers learn very slowly or not at all. Solutions: ReLU activation (gradient = 1 for positive inputs), residual connections (skip connections in ResNet add gradients directly), batch normalization, gradient clipping.

**Q: Adam vs SGD — when to use which?**

Adam (Adaptive Moment Estimation): adaptive learning rate per parameter, uses momentum + RMS of gradients. Converges faster, less sensitive to learning rate choice, better for sparse gradients. Default choice for most DL tasks.

SGD (+ momentum): simpler, often generalizes better than Adam with proper tuning, especially in computer vision. May need more hyperparameter tuning. Some research shows SGD reaches better final accuracy than Adam with enough training.

Rule of thumb: start with AdamW (Adam + weight decay) for quick iteration; switch to SGD with tuning if you need marginal accuracy improvement.

**Q: What is dropout and why does it help?**

Dropout randomly zeros out a fraction p of neurons during training, forcing the network to learn redundant representations — no single neuron can become too critical. This acts as an ensemble method (training many sub-networks implicitly). At inference, all neurons are active but their outputs are scaled by (1-p) to compensate. Reduces overfitting significantly in large networks.
