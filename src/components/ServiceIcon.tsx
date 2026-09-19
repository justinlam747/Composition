export default function ServiceIcon({ service }: { service: 'gemini' | 'fal' | 'bytedance' }) {
  return <img className="service-icon" src={`/services/${service}.svg`} alt="" aria-hidden="true" width={16} height={16} />;
}
