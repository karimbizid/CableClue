import { useDraggable } from '@dnd-kit/core';
import type { DeviceTemplate } from '../types';

function LibraryItem({ template }: { template: DeviceTemplate }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tpl:${template.key}`,
    data: { template },
  });
  return (
    <div
      ref={setNodeRef}
      className={`lib-item ${template.type} ${isDragging ? 'is-dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <span className="lib-item-label">{template.label}</span>
      <span className="lib-item-size">{template.size_u}U</span>
    </div>
  );
}

export function Library({ templates }: { templates: DeviceTemplate[] }) {
  return (
    <aside className="library">
      <h2>Library</h2>
      <p className="hint">Drag into a rack slot</p>
      <div className="lib-group">
        <h3>Switches</h3>
        {templates.filter((t) => t.type === 'switch').map((t) => (
          <LibraryItem key={t.key} template={t} />
        ))}
      </div>
      <div className="lib-group">
        <h3>Patch panels</h3>
        {templates.filter((t) => t.type === 'patch').map((t) => (
          <LibraryItem key={t.key} template={t} />
        ))}
      </div>
      <div className="lib-group">
        <h3>Blind panels</h3>
        {templates.filter((t) => t.type === 'blank').map((t) => (
          <LibraryItem key={t.key} template={t} />
        ))}
      </div>
    </aside>
  );
}
