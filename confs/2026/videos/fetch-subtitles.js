#!/usr/bin/env node
/**
 * fetch-subtitles.js
 * Downloads all KERICONF26 subtitle .srt files from GitHub
 * and saves them to KERICONF26/subtitles/ next to the .mp4 files.
 *
 * Usage: node fetch-subtitles.js
 * (Run from the directory containing this script.)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUBTITLES_DIR = path.join(__dirname, 'KERICONF26', 'subtitles');
const SUBTITLES_API_URL = 'https://api.github.com/repos/keri-foundation/CONF26-subtitles/contents/subtitles?ref=main';

async function fetchSubtitleUrls() {
    const apiHeaders = {
        'User-Agent': 'fetch-subtitles-script',
        Accept: 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
        apiHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    return new Promise((resolve, reject) => {
        const request = https.get(SUBTITLES_API_URL, { headers: apiHeaders }, (res) => {
            let body = '';

            if (res.statusCode !== 200) {
                return reject(new Error(`GitHub API responded with HTTP ${res.statusCode}`));
            }

            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const files = JSON.parse(body);
                    if (!Array.isArray(files)) {
                        return reject(new Error('Unexpected GitHub API response format'));
                    }
                    const urls = files
                        .filter((file) => file.type === 'file' && file.name.toLowerCase().endsWith('.srt'))
                        .map((file) => file.download_url)
                        .sort();
                    resolve(urls);
                } catch (err) {
                    reject(err);
                }
            });
        });

        request.on('error', reject);
    });
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const encodedBasename = urlObj.pathname.split('/').pop();
        const filename = decodeURIComponent(encodedBasename);
        const destPath = path.join(SUBTITLES_DIR, filename);

        const file = fs.createWriteStream(destPath);

        const request = https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                return downloadFile(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(destPath);
                return reject(new Error(`HTTP ${res.statusCode} for ${filename}`));
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`  done  ${filename}`);
                resolve({ filename, skipped: false });
            });
        });

        request.on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
        });

        file.on('error', (err) => {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(err);
        });
    });
}

async function main() {
    // Remove existing subtitles directory to ensure a clean mirror
    if (fs.existsSync(SUBTITLES_DIR)) {
        fs.rmSync(SUBTITLES_DIR, { recursive: true });
        console.log(`Removed existing subtitles directory\n`);
    }
    
    fs.mkdirSync(SUBTITLES_DIR, { recursive: true });
    console.log(`Saving subtitles to: ${SUBTITLES_DIR}\n`);

    let downloaded = 0, failed = 0;

    let subtitleUrls;
    try {
        subtitleUrls = await fetchSubtitleUrls();
    } catch (err) {
        console.error(`Failed to fetch subtitle list: ${err.message}`);
        process.exit(1);
    }

    if (subtitleUrls.length === 0) {
        console.log('No subtitle files found in the repository.');
        return;
    }

    for (const url of subtitleUrls) {
        try {
            await downloadFile(url);
            downloaded++;
        } catch (err) {
            console.error(`  FAIL  ${url}\n        ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone. Downloaded: ${downloaded}, Failed: ${failed}`);
}

main();
