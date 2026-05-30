import { passwordLabel } from '../lib/utils';

interface PasswordStrengthMeterProps {
  score: 0 | 1 | 2 | 3;
}

const colors = ['#dc2626', '#f59e0b', '#16a34a'];

export default function PasswordStrengthMeter({ score }: PasswordStrengthMeterProps) {
  return (
    <div className="meter">
      <div className="meter__track" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`meter__segment ${index <= score ? 'meter__segment--active' : ''}`}
            style={{ backgroundColor: index === 3 ? colors[2] : colors[Math.min(index, 2)] }}
          />
        ))}
      </div>
      <div className="meter__label">{passwordLabel(score)}</div>
    </div>
  );
}
