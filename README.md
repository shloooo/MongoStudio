## Mongo Studio

Mongo Studio is a free and open-source alternative to Studio3T and MongoDB Compass.

### Current Features

Current features include:
- Multiple database connections
  - SSH tunnel support (password or private key authentication)
  - Replica set support
  - Vault: encrypt saved connections with a "master password"
- Collections and entire databases can be copied between servers, between databases on the same connection, or into the current connection
- BSON types instead of raw data (`ObjectId`, `DBRef`, `UUID`, dates, Decimal128, etc. shown and edited as their real types)
- Tree and raw (shell-syntax) document editor, with inline cell editing in the collection view
- Bulk operations: update many documents by ID, set/remove a field across an entire collection
- Aggregation pipeline builder
- Built-in Mongo shell console with autocomplete and command history
- Index management
- GridFS browser
- Collection edit history
- Backup and restore
- User and role management
- Import and export collections as JSON or CSV, and export results as SQL
- Settings export/import to back up your configuration
- Auto-updates
- Language support (English, German)

### Issues

To help us handle your issues or requests more effectively, please use the correct form and follow the instructions provided there.

### How To compile from source

To compile Mongo Studio, you need [Node.js](https://nodejs.org/en) and [Yarn](https://yarnpkg.com/)

Clone this repo, run `yarn install`, then `yarn dist`.

The built app will be output to the `release/` directory.

### Development

To run Mongo Studio in development mode with hot-reloading:

```bash
yarn install
yarn dev:renderer
```

In a separate terminal:

```bash
yarn dev:electron
```

### License

See the [LICENSE](LICENSE) file for details.