# Neuro Decipher

### Automated Brain Signal Annotation System for EEG Seizure Detection and Classification

**Neuro Decipher** is an automated EEG analysis and annotation system designed for **seizure detection, seizure subtype classification, visualization, interpretability, and report generation**.

The system combines three complementary components:

- **AI-based EEG analysis**
- **Clinically inspired rule-based reasoning**
- **Hybrid AI + Rule decision fusion**

The objective is to combine the pattern-learning capabilities of deep learning with the transparency of rule-based EEG analysis, providing an interpretable research-oriented framework for automated seizure annotation.

---

## Overview

Manual interpretation of long-duration, multichannel EEG recordings is time-consuming and requires considerable neurological expertise. EEG recordings are also highly non-stationary, noisy, patient-dependent, and affected by artifacts.

Neuro Decipher addresses these challenges through an end-to-end workflow:

```text
EEG Recording
      │
      ▼
Preprocessing & Segmentation
      │
      ▼
Feature Extraction
      │
      ▼
Graph Construction
      │
      ├───────────────┐
      ▼               ▼
 AI Engine       Rule-Based Engine
      │               │
      └───────┬───────┘
              ▼
       Hybrid Fusion
              │
              ▼
   Detection / Classification
              │
              ▼
Visualization & Interpretability
              │
              ▼
Annotation & Report Generation
```

---

## Key Features

- Automated **seizure vs. non-seizure detection**
- Multi-class **seizure subtype classification**
- Multichannel EEG preprocessing and segmentation
- Graph-based representation of EEG channels
- Hybrid **CNN-LSTM** deep-learning architecture
- Clinically inspired EEG rule engine
- AI + rule-based confidence fusion
- Segment-wise prediction and confidence scores
- EEG waveform visualization
- Seizure onset and offset annotation
- EEG channel and feature contribution analysis
- Rule activation and contribution visualization
- Live prediction streaming during EEG processing
- Automated structured annotations
- CSV annotation export
- PDF report generation
- Persistent storage of recordings and analysis results

---

## EEG Representation

EEG recordings are represented using a graph-based approach in which:

- **Nodes** represent EEG channels/electrodes.
- **Edges** represent spatial and functional relationships between EEG channels.
- Signal-derived features describe the temporal and spectral behavior of individual channels.

This representation allows the system to preserve relationships between different brain regions rather than analyzing each EEG channel independently.

---

## AI Engine

The AI module uses a **hybrid CNN-LSTM architecture** to learn seizure-related patterns from graph-structured EEG data.

The processing pipeline includes:

1. EEG preprocessing
2. Signal segmentation
3. Feature extraction
4. Graph construction
5. Graph-to-tensor transformation
6. CNN-based feature extraction
7. Global pooling and regularization
8. LSTM-based temporal modeling
9. Task-specific prediction heads

The AI engine supports both:

- **Binary seizure detection**
- **Multi-class seizure classification**

---

## Rule-Based Engine

A separate rule-based engine analyzes clinically meaningful EEG characteristics.

Examples of evaluated characteristics include:

- Rhythmic activity
- Spike-and-wave morphology
- Frequency evolution
- Amplitude evolution
- EEG band power
- Channel synchronization
- Spectral characteristics
- Temporal signal behavior

The rule engine produces both a prediction and interpretable evidence explaining why particular EEG activity was considered seizure-related.

---

## Hybrid Decision System

The hybrid engine combines predictions from the AI and rule-based systems.

```text
AI Prediction + AI Confidence
               │
               ▼
          Hybrid Fusion
               ▲
               │
Rule Prediction + Rule Confidence
```

When both engines agree, the resulting prediction can be assigned greater confidence.

When they disagree, the final decision considers:

- AI confidence
- Rule confidence
- Strength of activated rules
- Predefined fusion logic

This provides a balance between **predictive learning and interpretability**.

---

## Seizure Classes

The system is designed to analyze multiple seizure categories, including:

- FNSZ — Focal Non-Specific Seizure
- GNSZ — Generalized Non-Specific Seizure
- TCSZ — Tonic-Clonic Seizure
- ABSZ — Absence Seizure
- TNSZ — Tonic Seizure
- MYSZ — Myoclonic Seizure
- CPSZ — Complex Partial Seizure

Class availability during training and evaluation depends on the available EEG samples in the dataset.

---

## Dataset

The project primarily uses the **Temple University Hospital EEG Seizure Corpus (TUH/TUSZ)**.

TUH provides large-scale, clinically annotated multichannel EEG recordings and is used for training and evaluating the seizure detection and classification components.

---

## Technologies

### Machine Learning & Signal Processing

- Python
- PyTorch
- MNE-Python
- NumPy
- Pandas
- Scikit-learn

### Backend

- Flask
- Celery

### Frontend

- React.js

### Database & Messaging

- PostgreSQL
- Redis
- Redis Streams
- Server-Sent Events (SSE)

---

## Real-Time Processing

Long EEG recordings are handled through asynchronous background processing.

```text
Upload EEG
    │
    ▼
Backend creates Job ID
    │
    ▼
Background Worker
    │
    ├── AI Prediction
    ├── Rule Prediction
    └── Hybrid Prediction
            │
            ▼
       Redis Stream
            │
            ▼
          Backend
            │
            ▼
    Server-Sent Events
            │
            ▼
      React Frontend
```

Predictions can therefore appear in the interface while the remaining EEG recording is still being processed.

Each prediction event can contain:

- Segment index
- Start time
- End time
- AI prediction
- AI confidence
- Rule-based prediction
- Rule confidence
- Hybrid prediction
- Hybrid confidence
- Processing status

---

## Performance

### AI-Based Seizure Detection

| Metric | Mean Performance |
|---|---:|
| Accuracy | **0.8794 ± 0.0099** |
| F1-Score | **0.6550 ± 0.0222** |
| ROC-AUC | **0.8062 ± 0.0197** |

The difference between accuracy and F1-score reflects the significant class imbalance commonly encountered in long-duration EEG seizure datasets.

### Seizure Classification

Seizure subtype classification is more challenging than binary seizure detection because of:

- severe class imbalance,
- similarity between seizure patterns,
- patient-to-patient variability,
- limited examples of rare seizure classes.

The AI-based seizure classification experiment achieved an overall accuracy of approximately **0.5255**, while the rule-based classifier achieved approximately **0.7987 accuracy** with a weighted F1-score of approximately **0.8581**. These values should be interpreted together with class-wise performance because strongly imbalanced seizure distributions can make overall accuracy misleading.

---

## Interpretability

Neuro Decipher does not provide only a final prediction.

The platform includes visual explanations such as:

- EEG channel importance
- Feature contribution
- AI confidence
- Rule confidence
- Hybrid confidence
- Rule activation frequency
- Rule contribution
- AI vs. rule agreement/disagreement
- Hybrid fusion contribution
- Segment-wise prediction explanations

These tools allow users to inspect the evidence associated with an automated decision.

---

## Annotation and Reporting

Predicted EEG segments can be combined into structured seizure events using their labels and temporal continuity.

Generated annotations may contain:

```text
Seizure Type
Start Time
End Time
Duration
AI Prediction
AI Confidence
Rule Prediction
Rule Confidence
Hybrid Prediction
Hybrid Confidence
```

Results can be exported for further analysis through:

- **CSV annotation files**
- **PDF reports**

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd Neuro-Decipher
```

Create a Python environment:

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

or Linux/macOS:

```bash
source venv/bin/activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies from the React application directory:

```bash
npm install
```

The project additionally requires properly configured **PostgreSQL**, **Redis**, and **Celery** services before running the complete web platform.

> Exact startup commands and environment variables should follow the configuration files included in the repository.

---

## Project Objectives

Neuro Decipher was developed to:

- reduce manual effort involved in reviewing long EEG recordings;
- automatically detect seizure activity;
- classify detected seizure events;
- preserve spatial and functional relationships between EEG channels;
- combine data-driven AI with interpretable EEG rules;
- provide real-time analysis feedback;
- automatically generate seizure annotations;
- improve transparency through interpretability visualization;
- provide an integrated EEG analysis and research platform.

---

## Limitations

Current limitations include:

- Class imbalance between seizure and non-seizure segments
- Strong imbalance between individual seizure subtypes
- Patient-specific variability in EEG patterns
- Sensitivity to artifacts and noise
- Possible generalization limitations across datasets and acquisition systems
- Fixed rule definitions may not capture every patient-specific seizure pattern
- Further external and clinical validation is required

---

## Future Work

Potential improvements include:

- External validation on independent EEG datasets
- Cross-dataset evaluation
- Improved seizure subtype classification
- Advanced data augmentation
- Synthetic minority seizure generation
- Patient-wise balancing
- Improved seizure-level sampling
- Better threshold optimization
- Enhanced graph-learning architectures
- Improved explainable AI techniques
- Clinical expert validation
- Optimization for larger-scale deployment

---

## Research and Clinical Disclaimer

> **Neuro Decipher is a research prototype and decision-support system. It is not a certified medical device and must not be used independently for clinical diagnosis or treatment decisions.**

EEG interpretation requires consideration of patient history, clinical context, recording quality, and expert neurological assessment. Further independent and clinical validation is required before real-world medical deployment.


## Acknowledgement

This project was completed as part of the Bachelor of Science in Computer Science program at the **Department of Computer Science, University of Engineering and Technology, Lahore**.



**Neuro Decipher — Combining Artificial Intelligence with interpretable EEG reasoning for automated brain signal annotation.**
