import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••••••',
  required = false,
  className = 'form-control',
  style = {},
  icon: Icon = Lock,
  disabled = false,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', ...style }}>
      {Icon && (
        <Icon
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-muted)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      <input
        type={showPassword ? 'text' : 'password'}
        className={className}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        style={{
          paddingLeft: Icon ? '38px' : '12px',
          paddingRight: '38px',
          width: '100%',
        }}
      />

      <button
        type="button"
        onClick={() => setShowPassword(prev => !prev)}
        tabIndex={-1}
        title={showPassword ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-muted)',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          zIndex: 2,
        }}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
