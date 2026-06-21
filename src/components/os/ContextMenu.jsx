import React from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 224));
  const top = Math.max(8, Math.min(y, window.innerHeight - 280));

  return (
    <div
      ref={menuRef}
      className="fixed z-[1200] min-w-48 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl p-1"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      data-testid="context-menu"
    >
      {items.map((item, index) => (
        item.separator ? (
          <div key={index} className="my-1 h-px bg-neutral-700" />
        ) : (
          <button
            key={index}
            type="button"
            className={`w-full text-left px-3 py-2 rounded hover:bg-neutral-800 ${item.danger ? 'text-red-300 hover:text-red-200' : ''}`}
            onClick={() => {
              item.action?.();
              onClose();
            }}
          >
            {item.label}
          </button>
        )
      ))}
    </div>
  );
}
