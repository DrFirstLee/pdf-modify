# Repository Instructions

This repository contains the static PDF Modify website and a local Model Context Protocol server under `mcp-server/`.

## MCP Server Notes

- The MCP server uses the official TypeScript SDK package `@modelcontextprotocol/sdk`.
- It runs over stdio with `StdioServerTransport`.
- Tool schemas are defined with `zod/v4`.
- VS Code MCP configuration is stored in `.vscode/mcp.json`.
- Start the MCP server with `npm --prefix mcp-server run dev` during development.
- Build it with `npm --prefix mcp-server run build` and run the compiled server with `npm --prefix mcp-server run start`.

SDK references:

- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP docs: https://modelcontextprotocol.io/docs
