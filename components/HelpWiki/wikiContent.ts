export type WikiPageId = 'surface' | 'models' | 'settings' | 'advance' | 'slice';

export type HelpTopic =
  | 'getting_started'
  | 'surface_configuration'
  | 'heating_bed'
  | 'toolhead_setup'
  | 'model_import'
  | 'procedural_shapes'
  | 'models_scene'
  | 'process_assignment'
  | 'scaffold_definition'
  | 'global_settings'
  | 'layer_refinement'
  | 'motion'
  | 'adhesion'
  | 'assistance'
  | 'hardware_profiles'
  | 'model_exceptions'
  | 'advanced_settings'
  | 'zones'
  | 'pore_injection'
  | 'pore_capacity'
  | 'hardware_setup_slice'
  | 'print_area_slice'
  | 'slice_preflight'
  | 'build_schedule'
  // Stable aliases retained for saved links and older UI entry points.
  | 'fdm_settings'
  | 'syringe_settings'
  | 'uv_settings'
  | 'labware'
  | 'gcode_preview'
  | 'firmware_output'
  | 'network_printer'
  | 'project_library'
  | 'hardware_mapping'
  | 'scaffold_mapping'
  | 'layer_actions';

export interface WikiSection {
  id: HelpTopic;
  title: string;
  purpose: string;
  details: string[];
  bio?: {
    summary: string;
    tips: string[];
  };
}

export interface WikiPage {
  id: WikiPageId;
  label: 'Surface' | 'Models' | 'Settings' | 'Advance' | 'Slice';
  icon: string;
  intro: string;
  sections: WikiSection[];
}

export const WIKI_PAGES: WikiPage[] = [
  {
    id: 'surface',
    label: 'Surface',
    icon: 'view_quilt',
    intro: 'Everything defined in the Surface tab: the working area, bed heating and the physical tool positions available to the machine.',
    sections: [
      {
        id: 'surface_configuration',
        title: 'Surface Configuration',
        purpose: 'Defines the physical area in which models can be placed and checked before slicing.',
        details: [
          'Glass Bed creates a rectangular working area using the entered X width and Y depth.',
          'Petri Dish creates a circular area using the selected 35, 60 or 90 mm diameter.',
          'Multiwell Plate creates the selected 6, 12, 24 or 48 well layout. Models can then be assigned or cloned to individual wells.',
          'The selected geometry controls placement limits and the bed representation. It does not automatically compensate for clamps, dish walls or toolhead clearance.',
        ],
        bio: {
          summary: 'The surface affects containment, usable sample area, sterile handling and access for dispensing tools.',
          tips: [
            'Enter the real usable area after subtracting clamps, dish walls and safety margins.',
            'For multiwell work, keep the complete model footprint and dispensing tip inside the well boundary.',
          ],
        },
      },
      {
        id: 'heating_bed',
        title: 'Heating Bed',
        purpose: 'Controls whether a bed-temperature command is included when the job is executed.',
        details: [
          'Enable Bed Heating activates temperature control for machines with a controllable heated bed.',
          'Temperature sets the requested bed target in degrees Celsius. It changes the machine command, not the surface geometry.',
          'When heating is disabled, F3D Studio does not request a bed temperature.',
        ],
        bio: {
          summary: 'Bed temperature can change gelation, viscosity and the time biological material spends under thermal exposure.',
          tips: [
            'Use a temperature validated for the material and cells, not only for surface adhesion.',
            'Allow the real surface to stabilize before starting a temperature-sensitive protocol.',
          ],
        },
      },
      {
        id: 'toolhead_setup',
        title: 'Toolhead',
        purpose: 'Defines the number of physical tool positions and the technology mounted in each position.',
        details: [
          'Machine toolheads sets the number of available slots. Each slot corresponds to a machine tool such as T0, T1 or T2.',
          'A slot may be Empty, FDM, Hydrogel or UV. More than one slot may use the same technology.',
          'Removing or changing a tool invalidates process assignments that still refer to it; those assignments must be resolved before slicing.',
          'Detailed nozzle, syringe and UV parameters are configured later in Settings → Hardware profiles.',
        ],
        bio: {
          summary: 'The mounted head, tip and calibration determine what can actually be deposited or exposed.',
          tips: [
            'Keep software slot numbering aligned with firmware and with the physical machine.',
            'Recheck offsets and volumetric calibration after changing a syringe, tip or head.',
          ],
        },
      },
    ],
  },
  {
    id: 'models',
    label: 'Models',
    icon: 'view_in_ar',
    intro: 'Everything in the Models tab: importing geometry, creating test shapes and managing the constructs currently placed in the scene.',
    sections: [
      {
        id: 'model_import',
        title: 'Load STL Files',
        purpose: 'Imports one or more STL meshes as printable models.',
        details: [
          'Click the dashed area to choose STL files, or drag compatible files onto it.',
          'Each file becomes an independent model in the scene and can be selected, transformed, assigned and deleted separately.',
          'Importing a mesh does not repair experimental dimensions or choose a process automatically. Confirm its scale and placement before continuing.',
        ],
        bio: {
          summary: 'Imported dimensions determine diffusion distances, material volume and total processing time.',
          tips: [
            'Do not scale a validated scaffold without rechecking pore size, strand spacing and process duration.',
            'Confirm units and physical dimensions immediately after import.',
          ],
        },
      },
      {
        id: 'procedural_shapes',
        title: 'Procedural Shapes',
        purpose: 'Creates simple rectangular prisms or cylinders without an external STL file.',
        details: [
          'Rect Prism uses width, depth and height.',
          'Cylinder uses diameter and height.',
          'Add Prism or Add Cylinder creates the model with the displayed dimensions; it can then be handled like an imported model.',
        ],
        bio: {
          summary: 'Simple shapes are useful for calibration coupons, material screening and controlled comparisons.',
          tips: [
            'Use identical dimensions when comparing materials or process parameters.',
            'Begin with a small calibration construct before committing biological material to a large build.',
          ],
        },
      },
      {
        id: 'models_scene',
        title: 'Models in Scene',
        purpose: 'Lists the active models and provides selection, well assignment and deletion controls.',
        details: [
          'Click a model row to select it in the viewport and inspector.',
          'The row reports its current tool reference, dimensions and well assignment where applicable.',
          'The well action assigns or clones a model to wells on a multiwell plate. The warning indicator reports a footprint that exceeds the selected well diameter.',
          'Delete removes the selected model from the current project.',
        ],
        bio: {
          summary: 'Scene organization should reflect the physical samples that will be produced.',
          tips: [
            'Keep enough wall and tool clearance around every sample, not only enough room for the mesh.',
            'Check that clones inherit the intended settings before treating them as experimental replicates.',
          ],
        },
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    intro: 'Everything in the Settings tab, following the same Essential, Tune and Expert progression used by the application.',
    sections: [
      {
        id: 'process_assignment',
        title: 'Process assignment',
        purpose: 'Chooses which configured tool produces each scaffold feature.',
        details: [
          'Perimeter, infill, solid infill, bottom layers, top layers and supports can reference different toolheads.',
          'Global assignments are the default. Model exceptions and Z zones may replace them in a narrower scope.',
          'An empty or incompatible assignment must be corrected before a valid job can be built.',
        ],
        bio: {
          summary: 'Assignments allow structural and biological materials to play distinct roles in one construct.',
          tips: [
            'Inspect the tool-colored preview to catch accidental biological material in solid layers or supports.',
            'Reduce unnecessary tool changes when material residence time matters.',
          ],
        },
      },
      {
        id: 'scaffold_definition',
        title: 'Scaffold definition',
        purpose: 'Defines the default layer and internal geometry inherited by the models.',
        details: [
          'Layer height sets the vertical thickness of each layer in micrometres.',
          'Infill sets the occupied internal percentage; infill pattern selects the internal path geometry.',
          'Walls controls perimeter count. Top layers and Bottom layers control the solid envelopes.',
          'These values are protocol defaults. Explicit model or zone overrides remain local.',
        ],
        bio: {
          summary: 'Layer geometry and infill jointly affect porosity, transport distance and mechanical support.',
          tips: [
            'Lower infill can open transport paths but may reduce structural stability.',
            'Keep layer height compatible with strand diameter and the intended pore interconnection.',
          ],
        },
      },
      {
        id: 'layer_refinement',
        title: 'Layer refinement',
        purpose: 'Adjusts the first layer and the orientation of the internal fill.',
        details: [
          'First layer sets the initial layer height independently from the default layer height.',
          'Fill angle rotates the infill direction. The slicer applies the configured angle to the generated path.',
        ],
        bio: {
          summary: 'The first layer anchors the construct, while fill orientation can alter anisotropy and transport paths.',
          tips: [
            'Validate first-layer compression on the real surface.',
            'Use controlled fill angles when comparing directional mechanical or biological responses.',
          ],
        },
      },
      {
        id: 'motion',
        title: 'Motion',
        purpose: 'Sets the requested movement speeds for perimeter, external perimeter, infill and travel moves.',
        details: [
          'Perimeter and External perimeter control structural outline speeds.',
          'Infill controls internal deposition speed.',
          'Travel controls non-depositing movement between path segments.',
          'Actual machine behavior remains subject to firmware acceleration, flow and hardware limits.',
        ],
        bio: {
          summary: 'Motion changes total process time and can affect placement accuracy or shear-sensitive deposition.',
          tips: [
            'Validate hydrogel-compatible motion in the syringe profile rather than assuming FDM speeds are transferable.',
            'Reduce aggressive travel over open samples when dripping or contamination is possible.',
          ],
        },
      },
      {
        id: 'adhesion',
        title: 'Bed adhesion',
        purpose: 'Adds skirt or brim geometry around the construct to prime the process or improve attachment.',
        details: [
          'Skirt loops sets how many non-contact outlines are generated around the model.',
          'Distance controls the gap between the skirt and model; Skirt layers controls its height.',
          'Brim width adds attached first-layer material around the model to increase surface contact.',
        ],
        bio: {
          summary: 'Adhesion must be balanced with sample handling and the intended permeability of the bottom region.',
          tips: [
            'Avoid auxiliary geometry that interferes with sterile removal or access to the sample.',
            'Confirm the protected bottom height before enabling pore injection.',
          ],
        },
      },
      {
        id: 'assistance',
        title: 'Assistance',
        purpose: 'Controls support generation and layer cooling.',
        details: [
          'Generate supports adds sacrificial geometry for overhangs using the tool assigned to supports.',
          'Layer fan enables cooling; Fan speed sets its output and Disable first layers delays its activation.',
          'Cooling changes machine output and should match the material being processed.',
        ],
        bio: {
          summary: 'Airflow and sacrificial material can affect temperature, dehydration and contamination exposure.',
          tips: [
            'Avoid direct fan use on exposed cell-laden materials unless it is experimentally justified.',
            'Confirm support removal will not damage or contaminate the biological region.',
          ],
        },
      },
      {
        id: 'hardware_profiles',
        title: 'Hardware profiles',
        purpose: 'Stores the canonical operating parameters for every configured FDM, Hydrogel and UV head.',
        details: [
          'FDM profiles define nozzle, extrusion, temperature and related motion behavior.',
          'Hydrogel profiles define syringe, tip, bioink, volumetric calibration and actuation behavior.',
          'UV profiles define exposure mode, power and timing behavior.',
          'Process panels select these heads; they do not create a second copy of the hardware parameters.',
        ],
        bio: {
          summary: 'Reproducible results require the profile to match the actual consumable, material and hardware.',
          tips: [
            'Calibrate hydrogel volume with the same syringe, tip, material and temperature used in the experiment.',
            'Validate UV dose using power, distance and cumulative exposure—not time alone.',
          ],
        },
      },
      {
        id: 'model_exceptions',
        title: 'Model exceptions',
        purpose: 'Overrides global scaffold values for one specific model.',
        details: [
          'A model inherits global settings until an exception is explicitly added.',
          'Exceptions affect only the selected model and take precedence over the global default.',
          'Use them only when one construct intentionally requires different geometry or behavior.',
        ],
        bio: {
          summary: 'Exceptions are useful for controlled experimental variants but can also hide unintended differences.',
          tips: [
            'Document each exception as an experimental variable.',
            'Check cloned or replicate models for unintended inherited differences.',
          ],
        },
      },
    ],
  },
  {
    id: 'advance',
    label: 'Advance',
    icon: 'tune',
    intro: 'Everything in the Advance tab: whole-scaffold pore injection and height-based overrides.',
    sections: [
      {
        id: 'pore_injection',
        title: 'Pore Injection',
        purpose: 'Deposits a requested syringe dose into accessible GRID cells immediately after eligible infill layers.',
        details: [
          'The main toggle applies pore injection to the complete scaffold. A local intervention must be enabled inside a Z zone instead.',
          'Injection requires an assigned syringe head, valid volumetric calibration, GRID infill and a range above the protected bottom shell.',
          'Volume per pore is the requested dose. Capacity is reported as planning information and is not silently clamped.',
          'The current protocol is layer-by-layer: injection occurs while the freshly printed pore remains accessible.',
        ],
        bio: {
          summary: 'Practical filling depends on dose, wetting, viscosity, gelation and access timing—not geometry alone.',
          tips: [
            'Start below the geometric maximum and validate leakage, retention and cell response with a dose series.',
            'Recalibrate after changing bioink, temperature, syringe or tip.',
            'Treat capacity warnings as experimental planning signals.',
          ],
        },
      },
      {
        id: 'zones',
        title: 'Advanced Overrides',
        purpose: 'Creates height-based regions that replace selected process behavior within a defined Z range.',
        details: [
          'New Zone creates a region with Z Start and Z End values. Scope applies it globally or to one model.',
          'Tool enables a tool or feature-mapping override inside the zone.',
          'Params enables local layer, infill and pore-injection parameters.',
          'Event enables a UV or pause event when compatible hardware is configured.',
          'Zones are evaluated by height and priority. Keep overlapping overrides intentional and easy to audit.',
        ],
        bio: {
          summary: 'Zones can create gradients or localized treatments without changing the complete construct.',
          tips: [
            'Use the narrowest zone that represents the biological hypothesis.',
            'Review transitions for abrupt changes in material, strand spacing or crosslinking.',
            'Record the reason and intended response for every zone.',
          ],
        },
      },
    ],
  },
  {
    id: 'slice',
    label: 'Slice',
    icon: 'layers',
    intro: 'Everything in the Slice tab: final protocol checks, physical summaries and generation or execution of the job.',
    sections: [
      {
        id: 'pore_capacity',
        title: 'Pore Protocol Preflight',
        purpose: 'Checks injection geometry, requested volume, calibration and readiness before executable G-code is produced.',
        details: [
          'Estimated deposits are planning values before slicing. Generated toolpaths can replace them with measured layer deposits and cell counts.',
          'Geometric max reports calculated available volume; Requested reports the programmed total dose.',
          'Warnings identify conditions such as requested dose above measured geometric capacity. Blockers prevent execution until resolved.',
          'Geometry, volume, collisions and dry-run states summarize the current protocol boundary.',
        ],
        bio: {
          summary: 'Geometric capacity is an upper bound; practical volume is material- and process-dependent.',
          tips: [
            'Use post-slice measured values in the final protocol record.',
            'Validate dose below the calculated maximum while observing overflow and retention.',
          ],
        },
      },
      {
        id: 'hardware_setup_slice',
        title: 'Hardware Setup',
        purpose: 'Summarizes the effective nozzle, layer height and bed-temperature state used for the build.',
        details: [
          'This panel is read-only. Change the source values in Surface or Settings.',
          'Use it as a final comparison against the physical machine before building.',
        ],
      },
      {
        id: 'print_area_slice',
        title: 'Print Area',
        purpose: 'Summarizes the active surface, maximum model height and number of models.',
        details: [
          'This panel is read-only and reflects the current scene.',
          'Unexpected values indicate that surface selection, model placement or model count should be reviewed before building.',
        ],
      },
      {
        id: 'build_schedule',
        title: 'Build Schedule Summary',
        purpose: 'Shows the vertical order of the base scaffold, Z zones and configured process events.',
        details: [
          'The vertical scale represents physical Z height.',
          'Colored zone overlays show where tool, parameter or UV behavior changes.',
          'Use the summary to verify ordering and transitions; use the generated G-code preview for path-level inspection.',
        ],
        bio: {
          summary: 'The schedule exposes total intervention order and repeated exposure of the same region.',
          tips: [
            'Review cumulative UV events and time before loading biological material.',
            'Check that injection occurs while the intended pores remain accessible.',
          ],
        },
      },
      {
        id: 'slice_preflight',
        title: 'Build and Execute',
        purpose: 'Generates the sliced job and, after validation, performs a dry-run before sending it to the printer.',
        details: [
          'Build generates the toolpath from the current project configuration.',
          'Execute print first requests the backend dry-run. A blocked dry-run prevents the physical job from starting.',
          'A ready status still requires confirmation of the real machine, loaded materials, offsets and local safety procedure.',
        ],
        bio: {
          summary: 'This is the final opportunity to prevent loss of material or an irreproducible biological run.',
          tips: [
            'Dry-run after hardware, consumable or offset changes.',
            'Archive the effective settings and warnings with the experiment.',
          ],
        },
      },
    ],
  },
];

const TOPIC_PAGE_ALIASES: Partial<Record<HelpTopic, WikiPageId>> = {
  getting_started: 'surface',
  global_settings: 'settings',
  advanced_settings: 'advance',
  fdm_settings: 'settings',
  syringe_settings: 'settings',
  uv_settings: 'settings',
  labware: 'settings',
  gcode_preview: 'slice',
  firmware_output: 'slice',
  network_printer: 'slice',
  project_library: 'slice',
  hardware_mapping: 'surface',
  scaffold_mapping: 'settings',
  layer_actions: 'advance',
};

export const getWikiPageForTopic = (topic: HelpTopic): WikiPage => {
  const directPage = WIKI_PAGES.find(page => page.sections.some(section => section.id === topic));
  const pageId = directPage?.id || TOPIC_PAGE_ALIASES[topic] || 'surface';
  return WIKI_PAGES.find(page => page.id === pageId) || WIKI_PAGES[0];
};
