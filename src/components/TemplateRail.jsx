import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { frames, customTemplates, assetPhotos, asset } from '../constants/assets.js';

const MiniTemplate = memo(function MiniTemplateComponent({ frame, photos, filter, accent }) {
  return (
    <div className={`mini-template frame-${frame.id}`} style={{ '--accent': accent }}>
      {photos.slice(0, frame.id === 'magazine' ? 3 : 4).map((photo, index) => (
        <img key={index} src={photo} style={{ filter: filter.css }} alt="" aria-hidden="true" />
      ))}
      <span>{frame.name}</span>
    </div>
  );
});

const CustomMiniTemplate = memo(function CustomMiniTemplateComponent({ template, photos, filter, accent }) {
  const imgSrc = template.image?.startsWith?.('data:') || template.image?.startsWith?.('blob:') || template.image?.startsWith?.('/') || template.image?.startsWith?.('http')
    ? template.image
    : asset(template.image || template.imagePath);
  const slots = template.photoSlots || [];

  return (
    <div className="mini-template mini-template-custom" style={{ '--accent': accent }}>
      <div
        className="custom-mini-strip-frame"
        style={{
          height: '100%',
          aspectRatio: template.aspectRatio ? `${template.aspectRatio}` : 'auto',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '7px',
          overflow: 'hidden',
        }}
      >
        {/* Photo slots behind the PNG overlay */}
        {slots.map((slot, index) => {
          const photo = photos?.[index] || assetPhotos[index % assetPhotos.length];
          const tilt = slot.rot !== undefined ? slot.rot : (template.tilt || 0);
          return (
            <div
              key={index}
              className="mini-custom-slot"
              style={{
                position: 'absolute',
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: `${slot.w * 100}%`,
                height: `${slot.h * 100}%`,
                borderRadius: template.id === 'custom-capturing-moments' ? '50%' : '3px',
                transform: tilt ? `rotate(${tilt}deg)` : undefined,
                transformOrigin: 'center center',
                overflow: 'hidden',
                zIndex: 1,
              }}
            >
              {photo && (
                <img
                  src={photo}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: filter?.css || 'none',
                    display: 'block',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Real PNG template overlay on top */}
        <img
          src={imgSrc}
          alt={`${template.name} template preview`}
          className="custom-template-thumb"
          loading="lazy"
          decoding="async"
        />
      </div>

      <span>{template.name}</span>
    </div>
  );
});

function TemplateRailComponent({ frame, setFrame, photos, filter, accent, compact = false, mode }) {
  const filteredCustom = useMemo(() => {
    if (!mode) return customTemplates;
    return customTemplates.filter(t => t.slots === mode);
  }, [mode]);

  return (
    <section id="templates" className={`template-section ${compact ? 'template-section-compact' : ''}`}>
      {!compact && (
        <div className="section-heading">
          <div className="section-title"><Sparkles size={18} /><span>Choose Your Vibe</span></div>
        </div>
      )}
      <div className="template-rail" aria-label="Template choices">
        {frames.map((item, index) => (
          <motion.button
            key={item.id}
            type="button"
            className={`template-card ${frame.id === item.id ? 'active' : ''}`}
            onClick={() => setFrame(item)}
            aria-pressed={frame.id === item.id}
            aria-label={`Use ${item.name} template`}
            whileHover={{ y: -8, rotate: index % 2 ? 1.4 : -1.4 }}
            whileTap={{ scale: 0.98 }}
          >
            <MiniTemplate frame={item} photos={photos} filter={filter} accent={accent} />
            <span>{item.name}</span>
          </motion.button>
        ))}

        {filteredCustom.length > 0 ? (
          <>
            <div className="template-rail-divider" aria-hidden="true" />
            {filteredCustom.map((template, index) => (
              <motion.button
                key={template.id}
                type="button"
                className={`template-card template-card-custom ${frame.id === template.id ? 'active' : ''}`}
                onClick={() => setFrame(template)}
                aria-pressed={frame.id === template.id}
                aria-label={`Use ${template.name} custom template`}
                whileHover={{ y: -8, rotate: index % 2 ? 1.4 : -1.4 }}
                whileTap={{ scale: 0.98 }}
              >
                <CustomMiniTemplate template={template} photos={photos} filter={filter} accent={accent} />
                <span>{template.name}</span>
              </motion.button>
            ))}
          </>
        ) : (
          mode && <p role="note" style={{ fontSize: 12, color: '#655d56', padding: '8px 4px' }}>Custom 3-photo templates need 3 shots — switch strip length to 3 to use them.</p>
        )}
      </div>
    </section>
  );
}

export const TemplateRail = memo(TemplateRailComponent);
