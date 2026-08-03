import { readData, writeData } from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { regions, updated_label } = req.body;
  if (!regions) return res.status(400).json({ error: 'regions required' });

  const current = await readData();

  Object.entries(regions).forEach(([id, { value }]) => {
    if (current.regions[id]) current.regions[id].value = Number(value);
  });

  if (updated_label !== undefined) current.updated_label = updated_label;

  await writeData(current);
  res.json({ success: true });
}
