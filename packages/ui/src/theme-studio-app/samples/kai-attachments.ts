// Sample data for <kai-attachments> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into

const thumb = (c: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${c}"/></svg>`);

const IMAGE_ITEMS = [
  { id: '1', type: 'file', filename: 'mountain-landscape.jpg', mediaType: 'image/jpeg', url: thumb('#3b6ea5') },
  { id: '2', type: 'file', filename: 'sunset-beach.png', mediaType: 'image/png', url: thumb('#e8915b') },
  { id: '3', type: 'file', filename: 'forest-trail.jpg', mediaType: 'image/jpeg', url: thumb('#3f7d5b') },
];

const MIXED_ITEMS = [
  { id: '1', type: 'file', filename: 'mountain-landscape.jpg', mediaType: 'image/jpeg', url: thumb('#3b6ea5') },
  { id: '2', type: 'file', filename: 'architecture.pdf', mediaType: 'application/pdf' },
  { id: '3', type: 'file', filename: 'podcast.mp3', mediaType: 'audio/mpeg' },
  { id: '4', type: 'file', filename: 'demo.mp4', mediaType: 'video/mp4' },
  { id: '5', type: 'source-document', title: 'kitn.dev', filename: 'kitn.dev' },
  { id: '6', type: 'file', filename: 'data.bin', mediaType: 'application/octet-stream' },
];

export default {
  sample: { items: MIXED_ITEMS },
  named: {
    images: { items: IMAGE_ITEMS },
  },
};
