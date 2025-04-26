# Callisto

A TypeScript-based client for the Model Context Protocol (MCP) with Google Suite integration.

## Description

Callisto is a powerful client implementation that integrates with the Model Context Protocol and provides seamless interaction with Google Suite services. It's built with TypeScript and Node.js, offering a robust foundation for building AI-powered applications with context-aware capabilities.

## Features

- Model Context Protocol (MCP) integration
- Google Suite API integration
- TypeScript support
- Express.js server capabilities
- Anthropic AI SDK integration
- Environment-based configuration

## Prerequisites

- Node.js >= 16.0.0
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd callisto
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with the necessary configuration.

## Usage

### Building the Project

```bash
npm run build
```

### Running the Application

```bash
npm start
```

### Setup

To run the initial setup:

```bash
npm run setup
```

## Scripts

- `npm run build`: Builds the TypeScript project
- `npm start`: Runs the built application
- `npm run clean`: Cleans the build directory
- `npm run setup`: Runs the setup script

## Dependencies

### Main Dependencies
- @anthropic-ai/sdk
- @modelcontextprotocol/sdk
- dotenv
- express
- google-auth-library
- googleapis
- open

### Development Dependencies
- @types/express
- @types/node
- ts-node
- typescript

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support, please open an issue in the repository. Email harinsrikanth@berkeley.edu if you have any questions.