import React from 'react';

export function TemplateSlot({ slot, children }) {
  return (
    <div className="custom-template-slot" style={{
      left: `${slot.x * 100}%`,
      top: `${slot.y * 100}%`,
      width: `${slot.w * 100}%`,
      height: `${slot.h * 100}%`,
      transform: slot.rot ? `rotate(${slot.rot}deg)` : undefined,
    }}>
      {children}
    </div>
  );
}
