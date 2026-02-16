import React from 'react';

interface IconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const Icon: React.FC<IconProps> = ({ name, className = "", style, onClick }) => {
  return (
    <span
      className={`material-icons-outlined ${className} ${onClick ? 'cursor-pointer' : ''}`}
      style={style}
      onClick={onClick}
    >
      {name}
    </span>
  );
};