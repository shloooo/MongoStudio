## Mongo Studio

Mongo Studio is a free and open-source alternative to Studio3T and MongoDB Compass.

### Current Features

Current features include:
- Multiple database connections
  - SSH tunnel support (password or private key authentication)
  - Replica set support
  - Encryption with a "master password" (AES-256, unlockable on startup)
  - Login credentials are stored locally
- Collections can be copied from server to server
- BSON types instead of raw data (`ObjectId`, `DBRef`, `UUID`, dates, etc. shown and edited as their real types)
- Tree and raw (shell-syntax) document editor, with inline cell editing in the collection view
- Bulk operations: update many documents by ID, set/remove a field across an entire collection
- Import and export collections as JSON or CSV
- Custom context menus for connections, collections, table headers, and document fields
- Settings export/import to back up your configuration
- Frameless, translucent window design

### Issues

To help us handle your issues or requests more effectively, please use the correct form and follow the instructions provided there.

### How To compile from source

To compile Mongo Studio, you need [Node.js](https://nodejs.org/en).

Clone this repo, run `npm install`, then `npm run dist`.

The built app will be output to the `release/` directory.

### Development

To run Mongo Studio in development mode with hot-reloading:

```bash
npm install
npm run dev:renderer
```

In a separate terminal:

```bash
npm run electron
```

### License

See the [LICENSE](LICENSE) file for details.