# Pandas for AI/ML

## Core Data Structures

```python
import pandas as pd
import numpy as np

# Series — 1D labeled array
s = pd.Series([10, 20, 30], index=['a', 'b', 'c'])
s['b']       # 20
s[1]         # 20 (positional)

# DataFrame — 2D labeled table
df = pd.DataFrame({
    'text': ['hello world', 'foo bar', 'baz'],
    'label': [1, 0, 1],
    'score': [0.9, 0.3, 0.8],
})
```

---

## Reading & Writing Data

```python
# CSV
df = pd.read_csv('data.csv')
df = pd.read_csv('data.csv',
    usecols=['text', 'label'],  # load only needed cols (memory!)
    dtype={'label': 'int8'},    # save memory
    chunksize=10_000,           # iterator for large files
)

# Parquet (faster + smaller than CSV for ML workflows)
df = pd.read_parquet('data.parquet')
df.to_parquet('output.parquet', index=False)

# JSON
df = pd.read_json('data.jsonl', lines=True)  # JSONL (one object per line)

# From list of dicts (common when loading LLM outputs)
records = [{'text': 'hello', 'label': 1}, {'text': 'world', 'label': 0}]
df = pd.DataFrame(records)
```

---

## Exploration

```python
df.shape        # (rows, cols)
df.dtypes       # column types
df.info()       # dtypes + non-null counts + memory usage
df.describe()   # count, mean, std, min, quartiles, max
df.head(5)
df.tail(5)
df.sample(10)

df['label'].value_counts()              # class distribution (key for ML!)
df['label'].value_counts(normalize=True) # proportions
df.isnull().sum()                       # missing values per column
df.duplicated().sum()                   # duplicate row count
```

---

## Selection & Filtering

```python
# Column selection
df['text']                   # Series
df[['text', 'label']]        # DataFrame

# Row selection
df.iloc[0]          # by integer position
df.iloc[0:5]        # first 5 rows
df.loc[0]           # by label/index
df.loc[0:4]         # rows 0 to 4 inclusive (label-based, end inclusive!)

# Boolean filtering (most common for ML data cleaning)
df[df['label'] == 1]
df[df['score'] > 0.5]
df[(df['label'] == 1) & (df['score'] > 0.5)]  # AND
df[(df['label'] == 1) | (df['score'] > 0.5)]  # OR
df[df['text'].str.contains('hello', na=False)]
df[df['label'].isin([0, 1])]                   # multiple values

# Select by dtype
df.select_dtypes(include='number')
df.select_dtypes(include='object')
```

---

## Data Cleaning (Critical for ML)

```python
# Drop missing values
df.dropna()                         # drop any row with NaN
df.dropna(subset=['text', 'label']) # only if these cols are NaN
df.dropna(thresh=2)                 # keep rows with at least 2 non-null

# Fill missing values
df['score'].fillna(0.0)
df['label'].fillna(df['label'].mode()[0])   # fill with mode
df['score'].fillna(df['score'].mean())      # fill with mean

# Drop duplicates
df.drop_duplicates()
df.drop_duplicates(subset=['text'])         # duplicate text only

# Rename columns
df.rename(columns={'text': 'input', 'label': 'target'})

# Change dtype
df['label'] = df['label'].astype('int8')
df['score'] = pd.to_numeric(df['score'], errors='coerce')  # bad values → NaN

# Strip whitespace from string columns
df['text'] = df['text'].str.strip()

# Reset index after filtering
df = df[df['score'] > 0.5].reset_index(drop=True)
```

---

## Feature Engineering for ML

```python
# String operations (vectorized — no loops)
df['word_count']      = df['text'].str.split().str.len()
df['char_count']      = df['text'].str.len()
df['is_question']     = df['text'].str.endswith('?')
df['text_lower']      = df['text'].str.lower()
df['first_word']      = df['text'].str.split().str[0]

# Numeric operations
df['score_normalized'] = (df['score'] - df['score'].min()) / (df['score'].max() - df['score'].min())
df['score_log']        = np.log1p(df['score'])  # log1p = log(1+x), handles 0

# Binning
df['score_bucket'] = pd.cut(df['score'], bins=[0, 0.3, 0.7, 1.0], labels=['low', 'mid', 'high'])
df['score_quantile'] = pd.qcut(df['score'], q=4, labels=['Q1', 'Q2', 'Q3', 'Q4'])

# One-hot encoding
dummies = pd.get_dummies(df['score_bucket'], prefix='bucket')
df = pd.concat([df, dummies], axis=1)

# Apply custom function (use sparingly — slower than vectorized)
df['processed'] = df['text'].apply(lambda x: x.replace('hello', 'hi'))

# Map values
df['label_name'] = df['label'].map({0: 'negative', 1: 'positive'})
```

---

## GroupBy — Aggregation & Analysis

```python
# Basic groupby
df.groupby('label')['score'].mean()
df.groupby('label')['score'].agg(['mean', 'std', 'count'])

# Multiple columns
df.groupby(['label', 'score_bucket'])['text'].count()

# Custom aggregation
df.groupby('label').agg(
    avg_score=('score', 'mean'),
    total_count=('text', 'count'),
    max_score=('score', 'max'),
)

# Transform (broadcast back to original shape — for normalization per group)
df['score_by_group'] = df.groupby('label')['score'].transform('mean')
```

---

## Merge & Join

```python
# Like SQL JOIN
result = pd.merge(df_left, df_right, on='id')
result = pd.merge(df_left, df_right, on='id', how='left')  # left join
result = pd.merge(df_left, df_right, left_on='doc_id', right_on='id')

# Concatenate (stack datasets)
combined = pd.concat([df_train, df_test], ignore_index=True)
combined = pd.concat([df_a, df_b], axis=1)  # side by side
```

---

## Efficient Iteration (When apply isn't enough)

```python
# ❌ Slow — never use iterrows for ML data processing
for i, row in df.iterrows():
    result = process(row['text'])

# ✅ Vectorized string operations (fastest for string columns)
df['result'] = df['text'].str.lower().str.replace(r'\s+', ' ', regex=True)

# ✅ apply — when vectorization isn't possible (still slow but OK for moderate data)
df['embedding'] = df['text'].apply(lambda x: get_embedding(x))

# ✅ Batch processing with itertuples (much faster than iterrows)
for row in df.itertuples(index=False):
    process(row.text, row.label)

# ✅ NumPy for numeric operations
df['score_sq'] = df['score'].values ** 2  # .values returns numpy array
```

---

## Working with Embeddings in Pandas

```python
# Store embeddings as column of lists
df['embedding'] = [get_embedding(t) for t in df['text'].tolist()]

# Convert to NumPy matrix for similarity search
embeddings = np.stack(df['embedding'].values)  # shape (N, dim)

# Compute cosine similarity to a query
query_emb = np.array(get_embedding("search query"))
query_emb /= np.linalg.norm(query_emb)
embeddings_normed = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
similarities = embeddings_normed @ query_emb
df['similarity'] = similarities
top_results = df.nlargest(5, 'similarity')[['text', 'similarity']]
```

---

## Memory Optimization

```python
# Check memory usage
df.memory_usage(deep=True).sum() / 1e6  # MB

# Downcast numeric types
df['score'] = df['score'].astype('float32')   # 8B → 4B
df['label'] = df['label'].astype('int8')      # 8B → 1B

# Use categories for low-cardinality string columns
df['label_name'] = df['label_name'].astype('category')  # huge savings for repeated strings

# Process large CSV in chunks
chunk_iter = pd.read_csv('huge_file.csv', chunksize=50_000)
results = []
for chunk in chunk_iter:
    results.append(process_chunk(chunk))
df = pd.concat(results, ignore_index=True)
```

---

## Train/Val/Test Split with Pandas

```python
from sklearn.model_selection import train_test_split

# Split preserving pandas DataFrame
X = df[['text', 'word_count', 'char_count']]
y = df['label']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# For time-series data — NO random split (use chronological)
df_sorted = df.sort_values('timestamp')
split_idx = int(len(df_sorted) * 0.8)
df_train = df_sorted.iloc[:split_idx]
df_test  = df_sorted.iloc[split_idx:]
```

---

## Interview Q&A

**Q: What is the difference between `loc` and `iloc`?**

`loc` is label-based — uses the actual index values (and the end is inclusive). `iloc` is position-based — uses integer positions 0..n-1 (end is exclusive, like Python slicing). After filtering, if you reset the index, both behave the same. Without resetting, `loc` uses the original labels.

**Q: Why should you never use `iterrows` for large DataFrames?**

`iterrows` converts each row to a Series, which has overhead per row — it's 10–100x slower than vectorized operations. For string columns, use `.str` accessor methods. For numeric, use NumPy ops on `.values`. For custom logic you can't vectorize, `.apply()` is acceptable, `itertuples()` is faster still, and `multiprocessing` is the last resort.

**Q: How do you handle class imbalance in a pandas DataFrame?**

```python
# 1. Check imbalance
df['label'].value_counts(normalize=True)

# 2. Oversample minority class (simple)
minority = df[df['label'] == 1]
majority = df[df['label'] == 0]
minority_upsampled = minority.sample(n=len(majority), replace=True, random_state=42)
df_balanced = pd.concat([majority, minority_upsampled]).reset_index(drop=True)

# 3. Or use imbalanced-learn (SMOTE, etc.)
from imblearn.over_sampling import SMOTE
X_res, y_res = SMOTE().fit_resample(X_train, y_train)
```

**Q: How do you convert a pandas DataFrame to tensors for PyTorch?**

```python
import torch

# Numeric features
X_tensor = torch.tensor(df[numeric_cols].values, dtype=torch.float32)
y_tensor  = torch.tensor(df['label'].values, dtype=torch.long)

# Full pipeline
from torch.utils.data import TensorDataset, DataLoader
dataset = TensorDataset(X_tensor, y_tensor)
loader  = DataLoader(dataset, batch_size=32, shuffle=True)
```

---

## Links to Refer

- [Pandas Documentation](https://pandas.pydata.org/docs/)
- [Pandas Cheat Sheet (PyData)](https://pandas.pydata.org/Pandas_Cheat_Sheet.pdf)
- [Pandas User Guide — IO Tools](https://pandas.pydata.org/docs/user_guide/io.html)
- [Efficient Pandas (Real Python)](https://realpython.com/fast-pandas-dataframe/)
- [imbalanced-learn docs](https://imbalanced-learn.org/)
