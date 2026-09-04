import {
  Braces,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FilePlus2,
  Folder,
  FolderPlus,
  Layers,
  Library,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/** Central icon registry — every icon in the app comes from here (Lucide). */
const ICONS = {
  x: X,
  plus: Plus,
  minus: Minus,
  square: Square,
  braces: Braces,
  folder: Folder,
  "folder-plus": FolderPlus,
  library: Library,
  layers: Layers,
  "file-plus": FilePlus2,
  trash: Trash2,
  download: Download,
  upload: Upload,
  pencil: Pencil,
  clock: Clock,
  settings: Settings,
  search: Search,
  chevron: ChevronRight,
  save: Save,
  copy: Copy,
  more: MoreHorizontal,
} as const;

export type IconName = keyof typeof ICONS;

export default function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={strokeWidth} className={className} />;
}
