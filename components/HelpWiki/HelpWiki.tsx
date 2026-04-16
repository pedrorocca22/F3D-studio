import React from 'react';
import { Icon } from '../Icon';

export type HelpTopic = 'hardware_mapping' | 'scaffold_mapping' | 'layer_actions' | 'fdm_settings' | 'syringe_settings' | 'uv_settings' | 'adhesion';

interface HelpContent {
  title: string;
  description: string;
  details: {
    label: string;
    text: string;
  }[];
}

const WIKI_CONTENT: Record<HelpTopic, HelpContent> = {
  hardware_mapping: {
    title: 'Hardware Mapping',
    description: 'Map physical bioprinter toolheads to virtual slots.',
    details: [
      { label: 'Toolhead Slots', text: 'Virtual slots assigned to specific physical axes (T0, T1, T2). Mapping ensures the G-code uses the correct tool for the correct operation.' },
      { label: 'Slot Assignments', text: 'You can assign the FDM hot-end, a specific Syringe, or the UV Crosslinker to any available slot depending on your printer configuration.' }
    ]
  },
  scaffold_mapping: {
    title: 'Scaffold Tool Mapping',
    description: 'Define which toolhead handles specific parts of the geometry.',
    details: [
      { label: 'Perimeters', text: 'The outer shell of the part. Usually printed with FDM for structural integrity or Syringe for bio-inks.' },
      { label: 'Infill', text: 'The internal structure. You can use different materials for infill compared to perimeters.' },
      { label: 'Solid Infill', text: 'Used for top and bottom layers. Critical for sealing biological constructs.' },
      { label: 'Support', text: 'Sacrificial material used for overhangs. Often printed with dissolvable polymers or temporary hydrogels.' }
    ]
  },
  layer_actions: {
    title: 'Layer Actions & Segments',
    description: 'Advanced multi-material sequencing by layer height.',
    details: [
      { label: 'Segments', text: 'Divide your print into vertical ranges (Z-height). Each range can have its own overrides.' },
      { label: 'Feature Override', text: 'Change which toolhead prints specific parts (e.g., use syringe for years 10-20).' },
      { label: 'Parameter Override', text: 'Adjust speeds, temperatures, or flow rates for a specific layer range.' },
      { label: 'Process Event', text: 'Insert custom G-code macros for pausing, cleaning, or specialized UV exposure routines.' }
    ]
  },
  fdm_settings: {
    title: 'FDM Configuration',
    description: 'Technical parameters for thermoplastic extrusion.',
    details: [
        { label: 'Retraction', text: 'The distance and speed the filament is pulled back during moves to prevent stringing and "oozing" on biological samples.' },
        { label: 'Z-Lift', text: 'Raises the nozzle during travel to avoid dragging across sensitive bio-printed layers.' },
        { label: 'Flowrate', text: 'Correction factor for material extrusion volume. Critical for maintaining dimensional accuracy in porous scaffolds.' }
    ]
  },
  syringe_settings: {
    title: 'Hydrogel Syringe',
    description: 'Specialized parameters for fluid and bio-ink extrusion.',
    details: [
        { label: 'Pressurization Steps', text: 'Pre-moves for the actuator to build internal pressure before starting a line. Essential for high-viscosity hydrogels.' },
        { label: 'Retraction Steps', text: 'Reverses the actuator to stop flow instantly. Prevents "drooling" after the line ends.' },
        { label: 'Flowrate (mm/s)', text: 'Controlled speed of the syringe plunger relative to the XY movement.' }
    ]
  },
  uv_settings: {
    title: 'UV Crosslinking',
    description: 'Photo-polymerization settings for light-sensitive bio-inks.',
    details: [
        { label: 'Dose', text: 'Total energy (mJ/cm²) delivered to the layer. Controls the degree of polymerization and stiffness.' },
        { label: 'Exposure Mode', text: 'Scanning mode uses the toolhead move speed to control dose, while Fixed mode pauses at the layer end for global exposure.' }
    ]
  },
  adhesion: {
    title: 'Adhesion & Bed Contact',
    description: 'Managing the interface between the printer and the substrate.',
    details: [
        { label: 'Brim', text: 'Extra perimeters touching the object to increase surface area and prevent detachment.' },
        { label: 'Skirt', text: 'Lines printed around the object to prime the nozzle and ensure clean flow before the main print starts.' }
    ]
  }
};

interface HelpWikiProps {
  topic: HelpTopic | null;
  onClose: () => void;
}

export const HelpWiki: React.FC<HelpWikiProps> = ({ topic, onClose }) => {
  if (!topic) return null;

  const content = WIKI_CONTENT[topic];

  return (
    <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-[100] transform transition-transform duration-300 ease-in-out flex flex-col ${topic ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Icon name="help_outline" className="text-primary" />
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            Tech Wiki: {content.title}
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
        >
          <Icon name="close" className="text-sm text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium italic">
            "{content.description}"
          </p>
        </div>

        <div className="space-y-5">
          {content.details.map((item, i) => (
            <div key={i} className="group">
              <h3 className="text-[9px] font-black text-primary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                {item.label}
              </h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed pl-2.5 border-l border-slate-100 dark:border-slate-800">
                {item.text}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-4 mt-auto border-t border-slate-100 dark:border-slate-800">
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
            <p className="text-[8px] text-primary/70 font-bold uppercase tracking-widest mb-1">Pro Tip</p>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              Hover over specific inputs in the main panel for instant tooltips. Most settings are derived from Bio-FFF research standards.
            </p>
          </div>
        </div>
      </div>
      
      <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
        <button 
          onClick={onClose}
          className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors"
        >
          Dismiss Helper
        </button>
      </div>
    </div>
  );
};
