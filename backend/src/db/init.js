#!/usr/bin/env node

const DatabaseSchema = require('./schema');

console.log('Initializing database...');

const schema = new DatabaseSchema();
schema.init();

console.log('✓ Database initialized successfully!');
console.log(`  Location: ${schema.dbPath}`);

schema.close();
