import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = process.argv[2];
if (!registryPath) {
  console.error('Usage: node gen-file-upload.mjs <registry-json-path>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
let content = data[0].files[0].content;
content = content.replace(/^"use client";\n\n/, '');
content = content.replace('from "@/lib/utils"', 'from "../../lib/utils"');
content = content.replace(
  'from "@/registry/bases/radix/hooks/use-as-ref"',
  'from "../../hooks/use-as-ref"',
);
content = content.replace(
  'from "@/registry/bases/radix/hooks/use-lazy-ref"',
  'from "../../hooks/use-lazy-ref"',
);
content = content.replace(
  `import {
  Direction as DirectionPrimitive,
  Slot as SlotPrimitive,
} from "radix-ui";`,
  'import { Slot } from "@radix-ui/react-slot";',
);
content = content.replace(
  'const dir = DirectionPrimitive.useDirection(dirProp);',
  'const dir = dirProp ?? "ltr";',
);
content = content.replace(/SlotPrimitive\.Slot/g, 'Slot');
content = content.replace(/\bsr-only\b/g, 'scn-sr-only');

const out = path.join(__dirname, '../src/components/ui/file-upload.tsx');
fs.writeFileSync(out, content);
console.log('Wrote', out, content.length, 'bytes');
