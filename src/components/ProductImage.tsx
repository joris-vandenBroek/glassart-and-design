export interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  fitBackground?: 'white' | 'ink';
}

const FIT_BACKGROUND_COLORS: Record<'white' | 'ink', string> = {
  white: '#ffffff',
  ink: '#060607',
};

export function ProductImage({ src, alt, className, fit = 'cover', fitBackground = 'white' }: ProductImageProps) {
  return (
    <div
      data-testid="product-image"
      className={`relative overflow-hidden ${className ?? ''}`}
      style={fit === 'contain' ? { backgroundColor: FIT_BACKGROUND_COLORS[fitBackground] } : undefined}
    >
      <img src={src} alt={alt} className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
    </div>
  );
}
