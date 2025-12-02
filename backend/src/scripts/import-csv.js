const fs = require('fs');
const csv = require('csv-parser');
const DatabaseService = require('../services/database');

/**
 * Import CD data from CSV file
 * Expected CSV format: Disc #,Artist,Album,Page
 */
async function importCSV(csvPath) {
  console.log('Starting CSV import...');
  console.log(`Reading from: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const db = new DatabaseService();
  const discs = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        // Parse CSV row
        const position = parseInt(row['Disc #']);
        const artist = row['Artist']?.trim();
        const album = row['Album']?.trim();

        if (!position || !artist || !album) {
          console.warn(`Skipping invalid row:`, row);
          return;
        }

        discs.push({ position, artist, album });
      })
      .on('end', () => {
        console.log(`\nParsed ${discs.length} discs from CSV`);
        console.log('Importing to database...\n');

        let imported = 0;
        let updated = 0;

        for (const disc of discs) {
          try {
            const existing = db.getDisc(disc.position);

            db.upsertDisc(disc.position, {
              artist: disc.artist,
              album: disc.album
            });

            if (existing) {
              updated++;
            } else {
              imported++;
            }

            if ((imported + updated) % 50 === 0) {
              process.stdout.write(`Processed ${imported + updated}/${discs.length} discs...\r`);
            }
          } catch (error) {
            console.error(`Error importing disc ${disc.position}:`, error.message);
          }
        }

        console.log(`\n\n✓ Import complete!`);
        console.log(`  - ${imported} new discs added`);
        console.log(`  - ${updated} existing discs updated`);
        console.log(`  - Total discs in database: ${imported + updated}`);

        db.close();
        resolve({ imported, updated });
      })
      .on('error', (error) => {
        console.error('Error reading CSV:', error);
        db.close();
        reject(error);
      });
  });
}

// Run if called directly
if (require.main === module) {
  const csvPath = process.argv[2] || '../CD Player Contents.csv';

  // Resolve relative path from project root
  const path = require('path');
  const resolvedPath = path.resolve(__dirname, '../../..', csvPath);

  importCSV(resolvedPath)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}

module.exports = importCSV;
