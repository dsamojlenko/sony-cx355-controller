const fs = require('fs');
const csv = require('csv-parser');
const DatabaseService = require('../services/database');

/**
 * Import CD data from CSV file
 * Expected CSV format: Disc #,Artist,Album,Page
 * Optional: Player column (defaults to 1 if not present)
 *
 * Usage:
 *   npm run import -- /path/to/file.csv           # Import as player 1
 *   npm run import -- /path/to/file.csv --player 2  # Import as player 2
 */
async function importCSV(csvPath, playerNumber = 1) {
  console.log('Starting CSV import...');
  console.log(`Reading from: ${csvPath}`);
  console.log(`Importing as Player: ${playerNumber}`);

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
        // Allow CSV to override player number if it has a Player column
        const player = row['Player'] ? parseInt(row['Player']) : playerNumber;

        if (!position || !artist || !album) {
          console.warn(`Skipping invalid row:`, row);
          return;
        }

        discs.push({ player, position, artist, album });
      })
      .on('end', () => {
        console.log(`\nParsed ${discs.length} discs from CSV`);
        console.log('Importing to database...\n');

        let imported = 0;
        let updated = 0;

        for (const disc of discs) {
          try {
            const existing = db.getDisc(disc.player, disc.position);

            db.upsertDisc(disc.player, disc.position, {
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
            console.error(`Error importing disc P${disc.player}-${disc.position}:`, error.message);
          }
        }

        console.log(`\n\n✓ Import complete!`);
        console.log(`  - ${imported} new discs added`);
        console.log(`  - ${updated} existing discs updated`);
        console.log(`  - Total discs imported: ${imported + updated}`);

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
  const args = process.argv.slice(2);
  let csvPath = '../CD Player Contents.csv';
  let playerNumber = 1;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--player' && args[i + 1]) {
      playerNumber = parseInt(args[i + 1]);
      i++;
    } else if (!args[i].startsWith('--')) {
      csvPath = args[i];
    }
  }

  // Resolve relative path from project root
  const path = require('path');
  const resolvedPath = path.resolve(__dirname, '../../..', csvPath);

  importCSV(resolvedPath, playerNumber)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}

module.exports = importCSV;
