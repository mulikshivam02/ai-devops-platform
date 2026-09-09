

## Architecture Style

The initial system is a modular monolith.

```text
Frontend
   ↓
REST API
   ↓
Application Services
   ↓
Domain Engines
   ↓
Collectors / External Systems
   ↓
MongoDB

AI is an additional reasoning layer and is not the source of truth.

High-Level Architecture

                    DevOps Resources
                          │
                          ▼
                   Resource Discovery
                          │
                          ▼
                    Data Collection
                          │
                          ▼
                    Normalization
                          │
                          ▼
                    Evidence Engine
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
        Dependency Graph         History
                │                   │
                └─────────┬─────────┘
                          ▼
                  Change Intelligence
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
             Risk Engine     Impact Prediction
                 │                 │
                 └────────┬────────┘
                          ▼
                      Deployment
                          │
                          ▼
                     Observability
                          │
                          ▼
                     Actual Impact
                          │
                          ▼
                 Prediction vs Reality
                          │
                          ▼
                     AI Reasoning
                          │
                          ▼
                  Incident Intelligence
                          │
                          ▼
                   Security Intelligence
                       │
                       ▼
                    Recommendation
                          │
                          ▼
                 Controlled Remediation
                          │
                          ▼
                       Verify
                          │
                          ▼
                       History