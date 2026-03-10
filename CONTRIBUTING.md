# Contributing to Streamify

First off, thank you for considering contributing to Streamify! It's people like you that make Streamify such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps which reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include screenshots if possible**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior and explain which behavior you expected to see instead**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB 7.0+
- Yarn package manager
- Expo CLI

### Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/yourusername/streamify.git
cd streamify

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your settings

# Frontend setup
cd ../frontend
yarn install
cp .env.example .env
# Edit .env with your settings
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
yarn test
```

### Code Style

#### Python (Backend)
- Follow PEP 8
- Use type hints where appropriate
- Maximum line length: 100 characters
- Use meaningful variable names

#### TypeScript/JavaScript (Frontend)
- Use TypeScript for all new files
- Follow Airbnb style guide
- Use functional components with hooks
- Maximum line length: 100 characters

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

Example:
```
Add HLS proxy support for CORS bypass

- Implement /api/proxy/stream endpoint
- Add Base64 URL encoding
- Handle chunked transfer encoding

Fixes #123
```

### Branch Naming

- Feature: `feature/description`
- Bugfix: `bugfix/description`
- Hotfix: `hotfix/description`
- Documentation: `docs/description`

## Project Structure

```
streamify/
├── frontend/              # Expo React Native App
│   ├── app/              # Expo Router (File-based routing)
│   ├── src/              # Source code
│   └── assets/           # Static assets
├── backend/              # FastAPI Server
│   ├── server.py         # Main application
│   └── requirements.txt  # Dependencies
└── docs/                 # Documentation
```

## Adding New Features

### Frontend Features

1. Create components in `frontend/src/components/`
2. Add screens in `frontend/app/` (use Expo Router conventions)
3. Update types in relevant files
4. Add tests in `__tests__/` directories
5. Update documentation

### Backend Features

1. Add endpoints in `backend/server.py`
2. Use Pydantic models for request/response validation
3. Follow async/await patterns
4. Add proper error handling
5. Update API documentation

## Testing Guidelines

### Frontend
- Use React Testing Library
- Test user interactions
- Test component rendering
- Mock API calls

### Backend
- Use pytest
- Test API endpoints
- Test database operations
- Mock external services

## Documentation

- Update README.md for user-facing changes
- Update inline code comments for complex logic
- Add JSDoc/docstrings for functions and classes
- Update API documentation for endpoint changes

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing to Streamify! 🎉
