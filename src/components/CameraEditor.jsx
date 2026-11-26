import { GradedPhoto } from './GradedPhoto.jsx';
import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Move, Sparkles, Wand2 } from 'lucide-react';
import { filters } from '../constants/assets.js';
import { Slider } from './Slider.jsx';

function CameraEditorComponent(props) {
  const {
    activeFilter,
    setActiveFilter,
    grain,
    setGrain,
    lightLeak,
    setLightLeak,
    vignette,
    setVignette,
    editorTab,
    setEditorTab,
  } = props;

  const tabs = [
    { id: 'filters', icon: Wand2, label: 'Filters' },
    { id: 'adjust', icon: Move, label: 'Adjust' },
  ];

  return (
    <motion.section className="booth-card camera-editor-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: 'spring', delay: 0.08 }}>
      <div className="section-title"><Sparkles size={18} /><span>Live Effects</span></div>
      <div className="tool-tabs" role="tablist" aria-label="Live effect controls">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={editorTab === tab.id}
            className={editorTab === tab.id ? 'active' : ''}
            onClick={() => setEditorTab(tab.id)}
          >
            <tab.icon size={20} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="editor-tab-content">
        {editorTab === 'filters' && (
          <>
            <div className="filter-grid">
              {filters.map((f) => (
                <button key={f.id} type="button" className={activeFilter.id === f.id ? 'active' : ''} onClick={() => setActiveFilter(f)} aria-pressed={activeFilter.id === f.id}>
                  <GradedPhoto src={f.preview} filter={f} alt="" aria-hidden="true" />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <p className="panel-hint">Live filters apply instantly to the camera feed</p>
          </>
        )}
        {editorTab === 'adjust' && (
          <div className="slider-list">
            <Slider label="Grain" value={grain} setValue={setGrain} />
            <Slider label="Light Leak" value={lightLeak} setValue={setLightLeak} />
            <Slider label="Vignette" value={vignette} setValue={setVignette} />
          </div>
        )}
      </div>
    </motion.section>
  );
}

export const CameraEditor = memo(CameraEditorComponent);
