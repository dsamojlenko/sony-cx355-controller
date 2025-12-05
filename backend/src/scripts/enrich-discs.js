#!/usr/bin/env node

/**
 * Enrich disc metadata from MusicBrainz
 *
 * Usage:
 *   npm run enrich                    # Enrich all discs missing metadata
 *   npm run enrich -- --all           # Force re-enrich all discs
 *   npm run enrich -- --player 1      # Enrich only player 1
 *   npm run enrich -- --disc 1:25     # Enrich specific disc (player:position)
 *   npm run enrich -- --disc 1:25 --disc 2:100  # Multiple specific discs
 *   npm run enrich -- --force         # Re-enrich even if already has metadata
 */

const DatabaseService = require('../services/database');
const MusicBrainzService = require('../services/musicbrainz');

const db = new DatabaseService();
const musicbrainz = new MusicBrainzService();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    force: false,
    player: null,
    discs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--player' && args[i + 1]) {
      options.player = parseInt(args[++i]);
    } else if (arg === '--disc' && args[i + 1]) {
      const [player, position] = args[++i].split(':').map(Number);
      if (player && position) {
        options.discs.push({ player, position });
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Enrich disc metadata from MusicBrainz

Usage:
  npm run enrich                    # Enrich all discs missing metadata
  npm run enrich -- --all           # Process all discs (skip already enriched)
  npm run enrich -- --force         # Force re-enrich even if already has metadata
  npm run enrich -- --player 1      # Only process player 1
  npm run enrich -- --disc 1:25     # Enrich specific disc (player:position)
  npm run enrich -- --disc 1:25 --disc 2:100  # Multiple specific discs

Options:
  --all       Process all discs in database
  --force     Re-enrich even if disc already has MusicBrainz data
  --player N  Only process discs from player N (1 or 2)
  --disc P:D  Enrich specific disc at player P, position D
  --help, -h  Show this help message

Examples:
  npm run enrich -- --all --force           # Refresh everything
  npm run enrich -- --player 1 --force      # Refresh all player 1 discs
  npm run enrich -- --disc 1:42             # Enrich single disc
`);
      process.exit(0);
    }
  }

  return options;
}

async function enrichDisc(disc, force = false) {
  const { player, position, artist, album } = disc;
  const label = `P${player}-${position}`;

  // Skip if already enriched (unless force)
  if (!force && !musicbrainz.needsEnrichment(disc)) {
    console.log(`  [SKIP] ${label}: ${artist} - ${album} (already enriched)`);
    return { status: 'skipped', disc };
  }

  try {
    console.log(`  [ENRICHING] ${label}: ${artist} - ${album}`);
    const metadata = await musicbrainz.enrichDisc(player, position, artist, album);

    // Update database
    db.upsertDisc(player, position, { ...disc, ...metadata });
    if (metadata.tracks && metadata.tracks.length > 0) {
      const updatedDisc = db.getDisc(player, position);
      db.setTracks(updatedDisc.id, metadata.tracks);
    }

    console.log(`  [OK] ${label}: Found ${metadata.track_count || 0} tracks, year: ${metadata.year || 'unknown'}`);
    return { status: 'success', disc, metadata };
  } catch (error) {
    console.error(`  [FAIL] ${label}: ${error.message}`);
    return { status: 'failed', disc, error: error.message };
  }
}

async function main() {
  const options = parseArgs();

  console.log('\n=== MusicBrainz Disc Enrichment ===\n');

  let discsToProcess = [];

  if (options.discs.length > 0) {
    // Specific discs requested
    for (const { player, position } of options.discs) {
      const disc = db.getDisc(player, position);
      if (disc) {
        discsToProcess.push(disc);
      } else {
        console.warn(`Warning: Disc P${player}-${position} not found in database`);
      }
    }
  } else {
    // Get discs from database
    const result = db.getDiscs({
      player: options.player,
      limit: 600,
    });
    discsToProcess = result.discs;
  }

  if (discsToProcess.length === 0) {
    console.log('No discs found to process.');
    process.exit(0);
  }

  // Filter to only those needing enrichment (unless --all or --force)
  if (!options.all && !options.force && options.discs.length === 0) {
    discsToProcess = discsToProcess.filter(d => musicbrainz.needsEnrichment(d));
  }

  console.log(`Found ${discsToProcess.length} disc(s) to process`);
  if (options.force) {
    console.log('Force mode: will re-enrich all discs');
  }
  console.log('');

  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
  };

  for (const disc of discsToProcess) {
    const result = await enrichDisc(disc, options.force);
    results[result.status]++;
  }

  console.log('\n=== Summary ===');
  console.log(`  Success: ${results.success}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log('');

  db.close();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
