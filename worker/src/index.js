import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;

import { marked } from 'marked';
import { BUILD_HASH, PDF_SOURCES } from './assets/pdfSources.js';
import pdfMakeFactory from 'pdfmake';
import vfsFonts from 'pdfmake/build/vfs_fonts.js';

const pdfMake = pdfMakeFactory;

// pdfmake vfs_fonts are base64 strings; pdfkit needs Buffers
const vfs = {};
for (const [k, v] of Object.entries(vfsFonts)) {
  vfs[k] = Buffer.from(v, 'base64');
}
Object.assign(pdfMake.virtualfs.storage, vfs);

pdfMake.addFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

function markdownToContent(md, filename) {
  const tokens = marked.lexer(md, {
    gfm: true,
    breaks: true,
  });

  const content = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const level = token.depth || 1;
        const style = {
          1: 'header',
          2: 'header2',
          3: 'header3',
          4: 'header4',
          5: 'subheader',
          6: 'subheader',
        }[level] || 'header';
        const text = token.text || '';
        content.push({ text, style });
        break;
      }
      case 'paragraph': {
        const text = token.text || '';
        content.push(text);
        break;
      }
      case 'list': {
        const listObj = [];
        for (const item of token.items) {
          const itemText = item.text || '';
          if (token.ordered) {
            listObj.push(itemText);
          } else {
            listObj.push(listObj.length === 0 ? itemText : itemText);
          }
        }
        content.push({
          ul: token.ordered ? undefined : listObj,
          ol: token.ordered ? listObj : undefined,
          marker: token.marker,
        });
        break;
      }
      case 'code': {
        const codeText = token.text || '';
        content.push({ text: codeText, style: 'code' });
        break;
      }
      case 'table': {
        const tableRows = [];
        if (token.header) {
          tableRows.push(token.header.map(c => String(c || '')));
        }
        if (token.cells) {
          for (const row of token.cells) {
            tableRows.push(row.map(c => String(c || '')));
          }
        }
        content.push({
          table: {
            body: tableRows,
          },
        });
        break;
      }
      case 'hr': {
        content.push({ text: '', pageBreak: 'after' });
        break;
      }
      case 'blockquote': {
        const text = token.text || '';
        content.push({ text, style: 'quote' });
        break;
      }
      case 'space':
        break;
      default: {
        const text = token.text || '';
        if (text) content.push(text);
        break;
      }
    }
  }

  const mdBaseName = filename.replace(/\/img\/user\/assets\//, '').replace('.pdf', '');

  return {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: mdBaseName, style: 'title' },
      ...content,
    ],
    defaultStyle: {
      fontSize: 11,
      fontFamily: 'Helvetica',
    },
    styles: {
      title: {
        fontSize: 22,
        bold: true,
        margin: [0, 0, 0, 10],
      },
      header: {
        fontSize: 18,
        bold: true,
        margin: [0, 12, 0, 6],
      },
      header2: {
        fontSize: 16,
        bold: true,
        margin: [0, 10, 0, 5],
      },
      header3: {
        fontSize: 14,
        bold: true,
        margin: [0, 8, 0, 4],
      },
      header4: {
        fontSize: 13,
        bold: true,
        margin: [0, 6, 0, 3],
      },
      subheader: {
        fontSize: 12,
        bold: true,
        margin: [0, 6, 0, 3],
      },
      code: {
        fontSize: 10,
        font: 'Courier',
        background: '#efefef',
        margin: [0, 4, 0, 4],
        preserveLeading: true,
      },
      quote: {
        italics: true,
        margin: [0, 4, 0, 4],
        color: '#555',
      },
    },
  };
}

async function generatePdfBuffer(md, filename) {
  const docDef = markdownToContent(md, filename);
  return await pdfMake.createPdf(docDef).getBuffer();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Only handle PDF requests under assets
    if (!pathname.startsWith('/img/user/assets/') || !pathname.endsWith('.pdf')) {
      // Let Pages handle other requests; but Worker only gets route traffic.
      // Return simple 404 for non-PDF.
      return new Response('Not Found', { status: 404 });
    }

    const cache = caches.default;
    const cacheKey = `https://gyorgygutai.dev/pdf-cache/${BUILD_HASH}${pathname}`;

    // Try cache first
    let cached;
    try {
      cached = await cache.match(cacheKey);
    } catch (e) {
      // cache not available in local dev
    }
    if (cached) {
      return cached;
    }

    // Find source markdown
    const md = PDF_SOURCES[pathname] || PDF_SOURCES['/' + pathname.split('/').pop().replace('.pdf', '')];
    if (!md) {
      return new Response('PDF source not found', { status: 404 });
    }

    let pdfBuffer;
    try {
      pdfBuffer = await generatePdfBuffer(md, pathname);
    } catch (e) {
      return new Response('PDF generation failed: ' + String(e), { status: 500 });
    }

    const response = new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

    // Cache the PDF in Cache API keyed by build hash
    ctx.waitUntil(
      (async () => {
        try {
          await cache.put(cacheKey, response.clone());
        } catch (e) {
          // cache not available in local dev
        }
      })()
    );

    return response;
  },
};
