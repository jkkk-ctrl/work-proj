import fs from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data.json');

const DEFAULT_DATA = {
  updated_label: '',
  last_modified: null,
  regions: {
    capital_region:     { name: '수도권', value: 72 },
    gangwon_region:     { name: '강원권', value: 25 },
    chungcheong_region: { name: '충청권', value: 38 },
    honam_region:       { name: '호남권', value: 45 },
    yeongnam_region:    { name: '영남권', value: 72 },
    jeju_region:        { name: '제주',   value: 18 },
  },
};

const BLOB_STORE = 'golf-data';
const BLOB_KEY = 'regions';

function isNetlify() {
  return !!process.env.NETLIFY;
}

async function getBlobStore() {
  const { getStore } = await import('@netlify/blobs');
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_TOKEN;
  if (siteID && token) {
    return getStore({ name: BLOB_STORE, siteID, token });
  }
  // auto-detection: works when NETLIFY_BLOBS_CONTEXT is injected by runtime
  return getStore(BLOB_STORE);
}

export async function readData() {
  if (isNetlify()) {
    try {
      const store = await getBlobStore();
      const data = await store.get(BLOB_KEY, { type: 'json' });
      if (data) {
        if (!data.last_modified) data.last_modified = new Date().toISOString();
        return data;
      }
    } catch {}
  }

  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      if (!data.last_modified) data.last_modified = new Date().toISOString();
      return data;
    }
  } catch {}

  return { ...structuredClone(DEFAULT_DATA), last_modified: new Date().toISOString() };
}

export async function writeData(data) {
  const toWrite = { ...data, last_modified: new Date().toISOString() };
  delete toWrite.auto_date;

  if (isNetlify()) {
    const store = await getBlobStore();
    await store.set(BLOB_KEY, JSON.stringify(toWrite));
    return;
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(toWrite, null, 2), 'utf-8');
}
