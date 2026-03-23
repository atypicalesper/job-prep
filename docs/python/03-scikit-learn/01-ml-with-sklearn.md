# Classical ML with scikit-learn

## The scikit-learn API Pattern

Every model follows the same interface — learn it once, use everywhere:

```python
from sklearn.linear_model import LogisticRegression

model = LogisticRegression()       # 1. Instantiate
model.fit(X_train, y_train)        # 2. Train
predictions = model.predict(X_test) # 3. Predict
score = model.score(X_test, y_test) # 4. Evaluate (accuracy for classifiers)
```

---

## Data Preprocessing

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder, OneHotEncoder
from sklearn.impute import SimpleImputer
import pandas as pd
import numpy as np

# StandardScaler — zero mean, unit variance (most common for ML)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)  # fit + transform on train
X_test_scaled  = scaler.transform(X_test)        # only transform on test (no fit!)

# MinMaxScaler — scale to [0, 1]
minmax = MinMaxScaler()
X_scaled = minmax.fit_transform(X)

# Handle missing values
imputer = SimpleImputer(strategy="mean")  # or "median", "most_frequent", "constant"
X_imputed = imputer.fit_transform(X)

# Label encoding (ordinal categories)
le = LabelEncoder()
y_encoded = le.fit_transform(["cat", "dog", "cat", "bird"])  # [0, 1, 0, 2]

# One-hot encoding
ohe = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
X_encoded = ohe.fit_transform(X_categorical)
```

---

## Train/Test Split & Cross-Validation

```python
from sklearn.model_selection import train_test_split, cross_val_score, KFold, StratifiedKFold

# Basic split
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    random_state=42,
    stratify=y  # preserve class distribution
)

# K-Fold Cross-Validation
kf = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=kf, scoring="accuracy")
print(f"CV: {scores.mean():.3f} ± {scores.std():.3f}")

# Stratified (for imbalanced classes)
skf = StratifiedKFold(n_splits=5)

# Cross-validate multiple metrics
from sklearn.model_selection import cross_validate
results = cross_validate(model, X, y, cv=5,
    scoring=["accuracy", "f1_weighted", "roc_auc"],
    return_train_score=True
)
```

---

## Classification Algorithms

```python
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.naive_bayes import GaussianNB

# Logistic Regression (baseline, always start here)
lr = LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced")

# Decision Tree
dt = DecisionTreeClassifier(max_depth=5, min_samples_leaf=10)

# Random Forest (usually beats single trees)
rf = RandomForestClassifier(n_estimators=100, max_depth=None, n_jobs=-1, random_state=42)

# Gradient Boosting (often best for tabular data)
gb = GradientBoostingClassifier(n_estimators=200, learning_rate=0.1, max_depth=3)

# XGBoost (even better, use in interviews for "production best practice")
from xgboost import XGBClassifier
xgb = XGBClassifier(n_estimators=200, learning_rate=0.1, tree_method="hist")
xgb.fit(X_train, y_train)
```

---

## Regression Algorithms

```python
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor

# Linear Regression
lr = LinearRegression()

# Ridge (L2 regularization — prevents overfitting)
ridge = Ridge(alpha=1.0)

# Lasso (L1 — can zero out features, feature selection)
lasso = Lasso(alpha=0.1)

# Random Forest Regressor
rf = RandomForestRegressor(n_estimators=100, n_jobs=-1)
```

---

## Evaluation Metrics

```python
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score,
    mean_squared_error, mean_absolute_error, r2_score
)

# Classification
print(classification_report(y_test, y_pred, target_names=["cat", "dog", "bird"]))
print(confusion_matrix(y_test, y_pred))
print(f"AUC-ROC: {roc_auc_score(y_test, model.predict_proba(X_test), multi_class='ovr'):.3f}")

# Regression
mse  = mean_squared_error(y_test, y_pred)
rmse = np.sqrt(mse)
mae  = mean_absolute_error(y_test, y_pred)
r2   = r2_score(y_test, y_pred)  # 1.0 = perfect, 0 = predicts mean
print(f"RMSE: {rmse:.3f}, MAE: {mae:.3f}, R²: {r2:.3f}")
```

---

## Pipeline — The Right Way

Pipelines prevent data leakage (preprocessing fit only on training data):

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier

# Feature groups
numeric_features = ["age", "salary", "experience"]
categorical_features = ["city", "department"]

# Transformers per feature type
numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore")),
])

# Combine
preprocessor = ColumnTransformer([
    ("num", numeric_transformer, numeric_features),
    ("cat", categorical_transformer, categorical_features),
])

# Full pipeline
pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", RandomForestClassifier(n_estimators=100))
])

pipeline.fit(X_train, y_train)
print(pipeline.score(X_test, y_test))
```

---

## Hyperparameter Tuning

```python
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV
from scipy.stats import randint, uniform

# Grid Search (exhaustive)
param_grid = {
    "classifier__n_estimators": [50, 100, 200],
    "classifier__max_depth": [None, 5, 10],
    "classifier__min_samples_leaf": [1, 5, 10],
}
grid_search = GridSearchCV(pipeline, param_grid, cv=5, scoring="f1_weighted", n_jobs=-1)
grid_search.fit(X_train, y_train)
print(grid_search.best_params_, grid_search.best_score_)

# Random Search (faster for large spaces)
param_dist = {
    "classifier__n_estimators": randint(50, 500),
    "classifier__max_depth": [None, 5, 10, 20],
    "classifier__min_samples_leaf": randint(1, 20),
}
random_search = RandomizedSearchCV(pipeline, param_dist, n_iter=50, cv=5, n_jobs=-1, random_state=42)
random_search.fit(X_train, y_train)
```

---

## Feature Importance & Selection

```python
# Feature importance (tree-based models)
rf.fit(X_train, y_train)
importances = pd.Series(rf.feature_importances_, index=feature_names).sort_values(ascending=False)
print(importances.head(10))

# Feature selection
from sklearn.feature_selection import SelectKBest, f_classif, RFE

# SelectKBest — statistical test
selector = SelectKBest(score_func=f_classif, k=20)
X_selected = selector.fit_transform(X_train, y_train)

# RFE (Recursive Feature Elimination)
rfe = RFE(estimator=LogisticRegression(), n_features_to_select=10)
X_rfe = rfe.fit_transform(X_train, y_train)
print(rfe.support_)  # boolean mask of selected features
```

---

## Clustering (Unsupervised)

```python
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score

# KMeans
kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
labels = kmeans.fit_predict(X)
print(f"Inertia: {kmeans.inertia_:.2f}")
print(f"Silhouette: {silhouette_score(X, labels):.3f}")  # higher = better separated

# Find optimal k (elbow method)
inertias = []
for k in range(2, 15):
    km = KMeans(n_clusters=k, random_state=42).fit(X)
    inertias.append(km.inertia_)

# DBSCAN (density-based, finds arbitrary shapes, handles noise)
db = DBSCAN(eps=0.5, min_samples=5)
labels = db.fit_predict(X)
# label -1 = noise point
```

---

## Interview Q&A

**Q: What is data leakage and how do Pipeline prevent it?**

Data leakage is when information from the test set "leaks" into model training, making evaluation metrics overly optimistic. A common mistake: `scaler.fit_transform(X_all)` before splitting — the scaler has seen test data's mean/std. Pipeline ensures `fit` only happens on training data: `pipeline.fit(X_train, y_train)` fits the scaler only on X_train, then `pipeline.predict(X_test)` transforms X_test using those training statistics.

**Q: When would you use L1 (Lasso) vs L2 (Ridge) regularization?**

L1 (Lasso) adds `α * Σ|weights|` to the loss — drives some weights exactly to zero, effectively selecting features. Use when you suspect many features are irrelevant. L2 (Ridge) adds `α * Σweights²` — shrinks all weights but rarely zeros them out. Use when all features may be relevant but you want to prevent overfitting. ElasticNet combines both.

**Q: What is the bias-variance trade-off?**

Bias = error from wrong model assumptions (underfitting — model is too simple). Variance = error from sensitivity to training data fluctuations (overfitting — model is too complex). High bias: both train and test error are high. High variance: train error is low but test error is much higher. The goal is to find the sweet spot. Cross-validation helps identify which regime you're in. Regularization reduces variance at the cost of some bias.

**Q: Why is cross-validation better than a single train/test split?**

A single split can be lucky or unlucky — the specific random partition might not represent the overall distribution. K-fold cross-validation trains and evaluates on K different splits, giving K scores that estimate both mean performance and variance. The variance tells you how stable the model is. Stratified K-fold ensures each fold has the same class distribution, critical for imbalanced datasets.
