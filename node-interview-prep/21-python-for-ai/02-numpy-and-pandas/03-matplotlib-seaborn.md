# Matplotlib & Seaborn for AI/ML

Data visualization is not optional in ML — it's how you catch bad data, understand model behavior, and communicate results.

---

## Matplotlib Basics

```python
import matplotlib.pyplot as plt
import numpy as np

# Basic line plot
x = np.linspace(0, 10, 100)
plt.figure(figsize=(8, 4))
plt.plot(x, np.sin(x), label='sin(x)', color='#6c5ce7')
plt.plot(x, np.cos(x), label='cos(x)', color='#e74c3c', linestyle='--')
plt.title('Sine and Cosine')
plt.xlabel('x')
plt.ylabel('y')
plt.legend()
plt.tight_layout()
plt.savefig('plot.png', dpi=150, bbox_inches='tight')  # save before show()
plt.show()

# Subplots — multiple panels
fig, axes = plt.subplots(1, 2, figsize=(12, 4))
axes[0].hist(np.random.randn(1000), bins=40, color='#6c5ce7', edgecolor='white')
axes[0].set_title('Distribution')
axes[1].scatter(np.random.randn(200), np.random.randn(200), alpha=0.5)
axes[1].set_title('Scatter')
plt.tight_layout()
plt.show()
```

---

## Essential Plots for ML

### 1. Training / Loss Curves

```python
epochs = range(1, 51)
train_loss = [1.2 * (0.95 ** i) + 0.01 * np.random.randn() for i in epochs]
val_loss   = [1.3 * (0.94 ** i) + 0.02 * np.random.randn() + 0.05 for i in epochs]

plt.figure(figsize=(8, 4))
plt.plot(epochs, train_loss, label='Train Loss', color='#6c5ce7')
plt.plot(epochs, val_loss,   label='Val Loss',   color='#e74c3c', linestyle='--')
plt.xlabel('Epoch')
plt.ylabel('Loss')
plt.title('Training Curves')
plt.legend()
plt.grid(alpha=0.3)
plt.tight_layout()
plt.show()
```

### 2. Confusion Matrix

```python
from sklearn.metrics import confusion_matrix, ConfusionMatrixDisplay
import matplotlib.pyplot as plt

y_true = [0, 1, 1, 0, 1, 0, 1, 1]
y_pred = [0, 1, 0, 0, 1, 1, 1, 0]

cm = confusion_matrix(y_true, y_pred)
disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=['Negative', 'Positive'])
disp.plot(cmap='Blues')
plt.title('Confusion Matrix')
plt.tight_layout()
plt.show()
```

### 3. Feature Importance

```python
from sklearn.ensemble import RandomForestClassifier

features = ['word_count', 'char_count', 'sentiment', 'tfidf_max', 'embedding_norm']
importances = np.array([0.32, 0.18, 0.25, 0.15, 0.10])
sorted_idx = np.argsort(importances)

plt.figure(figsize=(7, 4))
plt.barh([features[i] for i in sorted_idx], importances[sorted_idx], color='#6c5ce7')
plt.xlabel('Importance')
plt.title('Feature Importance')
plt.tight_layout()
plt.show()
```

### 4. ROC Curve

```python
from sklearn.metrics import roc_curve, auc

y_true  = np.array([0, 0, 1, 1, 1, 0, 1, 0])
y_score = np.array([0.1, 0.3, 0.7, 0.9, 0.8, 0.4, 0.6, 0.2])

fpr, tpr, _ = roc_curve(y_true, y_score)
roc_auc = auc(fpr, tpr)

plt.figure(figsize=(6, 5))
plt.plot(fpr, tpr, color='#6c5ce7', lw=2, label=f'ROC curve (AUC = {roc_auc:.2f})')
plt.plot([0, 1], [0, 1], color='gray', linestyle='--')
plt.xlabel('False Positive Rate')
plt.ylabel('True Positive Rate')
plt.title('ROC Curve')
plt.legend()
plt.tight_layout()
plt.show()
```

### 5. Embedding Similarity Heatmap

```python
import numpy as np
import matplotlib.pyplot as plt

# Cosine similarity matrix for a set of embeddings
labels = ['apple', 'fruit', 'car', 'vehicle', 'python', 'snake']
# Simulated similarity matrix (normally from actual embeddings)
sim = np.array([
    [1.00, 0.82, 0.12, 0.10, 0.20, 0.18],
    [0.82, 1.00, 0.08, 0.07, 0.15, 0.14],
    [0.12, 0.08, 1.00, 0.91, 0.05, 0.07],
    [0.10, 0.07, 0.91, 1.00, 0.04, 0.06],
    [0.20, 0.15, 0.05, 0.04, 1.00, 0.65],
    [0.18, 0.14, 0.07, 0.06, 0.65, 1.00],
])

fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(sim, cmap='RdYlGn', vmin=0, vmax=1)
ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, rotation=45, ha='right')
ax.set_yticks(range(len(labels))); ax.set_yticklabels(labels)

for i in range(len(labels)):
    for j in range(len(labels)):
        ax.text(j, i, f'{sim[i, j]:.2f}', ha='center', va='center', fontsize=8,
                color='black' if sim[i, j] < 0.7 else 'white')

plt.colorbar(im, ax=ax)
plt.title('Embedding Cosine Similarity')
plt.tight_layout()
plt.show()
```

---

## Seaborn — Statistical Visualization

Seaborn builds on matplotlib with a higher-level API and better default aesthetics.

```python
import seaborn as sns
import pandas as pd
import matplotlib.pyplot as plt

# Use a theme
sns.set_theme(style='darkgrid', palette='muted')
```

### Class Distribution (countplot)

```python
df = pd.DataFrame({'label': ['positive'] * 80 + ['negative'] * 20 + ['neutral'] * 50})

plt.figure(figsize=(6, 4))
sns.countplot(data=df, x='label', order=df['label'].value_counts().index, palette='viridis')
plt.title('Class Distribution')
plt.tight_layout()
plt.show()
```

### Correlation Heatmap

```python
# Essential for feature selection — find highly correlated features to drop
df_num = pd.DataFrame(np.random.randn(100, 5), columns=['feat_a', 'feat_b', 'feat_c', 'feat_d', 'target'])
df_num['feat_b'] = df_num['feat_a'] * 0.9 + np.random.randn(100) * 0.1  # high correlation

plt.figure(figsize=(6, 5))
sns.heatmap(df_num.corr(), annot=True, fmt='.2f', cmap='coolwarm', center=0,
            square=True, linewidths=0.5)
plt.title('Feature Correlation Matrix')
plt.tight_layout()
plt.show()
```

### Distribution Plots

```python
# histplot with KDE — understand data distribution before modeling
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

data_normal = np.random.randn(500)
data_skewed = np.random.exponential(scale=2, size=500)

sns.histplot(data_normal, kde=True, ax=axes[0], color='#6c5ce7')
axes[0].set_title('Normal Distribution')

sns.histplot(data_skewed, kde=True, ax=axes[1], color='#e74c3c')
axes[1].set_title('Skewed Distribution (needs log transform)')
plt.tight_layout()
plt.show()
```

### Box Plot — Outlier Detection

```python
df_scores = pd.DataFrame({
    'model': ['BERT'] * 100 + ['GPT-2'] * 100 + ['Mistral'] * 100,
    'f1_score': (
        np.random.normal(0.82, 0.05, 100).tolist() +
        np.random.normal(0.78, 0.08, 100).tolist() +
        np.random.normal(0.85, 0.04, 100).tolist()
    )
})

plt.figure(figsize=(7, 4))
sns.boxplot(data=df_scores, x='model', y='f1_score', palette='Set2')
sns.stripplot(data=df_scores, x='model', y='f1_score', color='black', alpha=0.2, size=2)
plt.title('Model F1 Score Comparison')
plt.tight_layout()
plt.show()
```

### Scatter with Regression Line

```python
# pairplot — see relationships across all features at once
df_iris = sns.load_dataset('iris')  # built-in dataset for quick tests
sns.pairplot(df_iris, hue='species', diag_kind='kde', plot_kws={'alpha': 0.5})
plt.suptitle('Iris Feature Relationships', y=1.02)
plt.show()
```

---

## Plotting in Jupyter / Colab

```python
# Inline display (put at top of notebook)
%matplotlib inline

# Higher-res figures in Jupyter
%config InlineBackend.figure_format = 'retina'

# Interactive plots (zoom/pan in notebook)
%matplotlib widget
# or: pip install plotly && import plotly.express as px
```

---

## Saving Publication-Quality Figures

```python
plt.figure(figsize=(8, 5))
# ... your plot ...
plt.savefig(
    'figure.pdf',          # PDF for papers
    dpi=300,               # 300 DPI for print
    bbox_inches='tight',   # don't clip labels
    facecolor='white',     # white background (important for dark IDE themes)
)
plt.savefig('figure.png', dpi=150, bbox_inches='tight')
```

---

## Quick Reference — Which Plot for What?

| Goal | Plot |
|---|---|
| Distribution of one variable | `sns.histplot` with `kde=True` |
| Compare distributions across groups | `sns.boxplot` or `sns.violinplot` |
| Relationship between 2 numeric vars | `plt.scatter` or `sns.regplot` |
| Correlation matrix | `sns.heatmap(df.corr())` |
| Class imbalance | `sns.countplot` |
| Training curves | `plt.plot` (loss vs epoch) |
| Model comparison | `sns.barplot` with error bars |
| Feature importance | `plt.barh` sorted |
| Confusion matrix | `ConfusionMatrixDisplay` |
| Embedding similarity | `sns.heatmap` |

---

## Interview Q&A

**Q: You trained a model and accuracy looks great but it performs poorly on new data. How would you use visualization to debug?**

1. **Plot class distribution** — if the test set has different class balance, the metric is misleading
2. **Plot training vs validation loss** — if val loss increases while train loss drops, it's overfitting
3. **Confusion matrix** — reveals which classes are confused (e.g., model always predicts majority class)
4. **Feature correlation heatmap** — check for data leakage (a feature that directly encodes the label)
5. **Data distribution shift** — plot histograms of key features in train vs test; if they look different, that's the problem

---

## Links to Refer

- [Matplotlib Gallery](https://matplotlib.org/stable/gallery/)
- [Seaborn Gallery](https://seaborn.pydata.org/examples/)
- [Python Graph Gallery](https://python-graph-gallery.com/)
- [Plotly for Interactive ML Viz](https://plotly.com/python/)
