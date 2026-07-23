import React from 'react';

export default function Skeleton({ width, height, style, circle, count = 1 }) {
  const skeletons = Array.from({ length: count });

  const getStyle = () => {
    const customStyle = { ...style };
    if (width !== undefined) customStyle.width = typeof width === 'number' ? `${width}px` : width;
    if (height !== undefined) customStyle.height = typeof height === 'number' ? `${height}px` : height;
    if (circle) {
      customStyle.borderRadius = '50%';
      if (width !== undefined && height === undefined) customStyle.height = typeof width === 'number' ? `${width}px` : width;
    }
    return customStyle;
  };

  return (
    <>
      {skeletons.map((_, index) => (
        <span
          key={index}
          className="skeleton-shimmer"
          style={{
            display: 'inline-block',
            width: width !== undefined ? undefined : '100%',
            height: height !== undefined ? undefined : '16px',
            marginBottom: index < count - 1 ? '8px' : '0px',
            ...getStyle()
          }}
        />
      ))}
    </>
  );
}
