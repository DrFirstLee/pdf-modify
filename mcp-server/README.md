# @drfirst/pdf-modify-mcp

MCP server for PDF Modify. It exposes local file-based PDF tools over stdio so MCP clients can merge, split, reorder, crop, and convert PDF-related files without uploading them to a remote server.

## Quick Start

Run directly with npx:

```bash
npx -y @drfirst/pdf-modify-mcp
```

VS Code MCP example:

```json
{
  "servers": {
    "pdf-modify-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@drfirst/pdf-modify-mcp"]
    }
  }
}
```

## Tools

- `pdf_info`: read PDF page count and basic information
- `pdf_merge`: merge multiple PDFs in order
- `pdf_split`: extract page ranges such as `1-3, 5, 8-10`
- `pdf_reorder`: reorder pages within one PDF or across multiple PDFs
- `pdf_crop`: crop one PDF page using point coordinates
- `office_to_pdf`: convert `.docx` or `.pptx` to a text-based PDF
- `pdf_to_word`: export extractable PDF text to `.docx`
- `pdf_to_ppt`: export extractable PDF text to `.pptx` slides

## Notes

This MCP server works with local file paths. Files are read from disk and written back to disk. It does not upload files to a remote service.

Office and PDF conversion is text-focused for automation. It is not intended to perfectly preserve Microsoft Office or visual PDF layout.
