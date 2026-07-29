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

export function readData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      if (!data.last_modified) data.last_modified = new Date().toISOString();
      return data;
    }
  } catch {}
  const now = new Date().toISOString();
  return { ...structuredClone(DEFAULT_DATA), last_modified: now };
}

export function writeData(data) {
  const toWrite = { ...data, last_modified: new Date().toISOString() };
  // Strip legacy auto_date field if present
  delete toWrite.auto_date;
  fs.writeFileSync(DATA_PATH, JSON.stringify(toWrite, null, 2), 'utf-8');
}
