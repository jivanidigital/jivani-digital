import { PDFDocument } from 'pdf-lib';

// Preserve vector label content. Fit the observed carrier 298x421 pt export
// inside 4x6 without cropping, for the packer's fixed 100% print setting.
export async function composeLabelPDF({ orders, shipments, labelBytes }) {
  if (orders.length !== labelBytes.length || orders.length !== shipments.length || !orders.length) throw new Error('Labels must match orders one-to-one');
  const labels = await PDFDocument.create();
  for (const bytes of labelBytes) {
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() !== 1) throw new Error('Expected exactly one official label per AWB');
    const page = doc.getPage(0), size = page.getSize();
    const native = Math.abs(size.width-288)<=2 && Math.abs(size.height-432)<=2;
    const observed = Math.abs(size.width-298)<=2 && Math.abs(size.height-421)<=2;
    if ((!native && !observed) || page.getRotation().angle !== 0) throw new Error('Official label is not a recognized portrait label size; review export settings');
    if (size.width===288 && size.height===432) labels.addPage((await labels.copyPages(doc,[0]))[0]);
    else {
      const embedded=await labels.embedPage(page);
      const scale=Math.min(288/size.width,432/size.height);
      const target=labels.addPage([288,432]);
      target.drawPage(embedded,{x:(288-size.width*scale)/2,y:(432-size.height*scale)/2,width:size.width*scale,height:size.height*scale});
    }
  }
  return { labels:await labels.save() };
}
