export interface MedicalSkill {
  id: string;
  name: string;
  category: "research-pipeline" | "omics-bioinformatics" | "evidence-synthesis" | "protocol-generator" | "database";
  description: string;
  sourceRepo: string;
  skillPath: string;
  integrated: boolean;
}

export interface EvidenceGrade {
  tier: "T1" | "T2" | "T3" | "T4";
  label: string;
  stars: string;
  description: string;
}

export const EVIDENCE_TIERS: Record<string, EvidenceGrade> = {
  T1: {
    tier: "T1",
    label: "Mechanistic",
    stars: "★★★",
    description: "In-target study with direct experimental evidence",
  },
  T2: {
    tier: "T2",
    label: "Functional",
    stars: "★★☆",
    description: "Functional study showing role in pathway context",
  },
  T3: {
    tier: "T3",
    label: "Association",
    stars: "★☆☆",
    description: "Screen hit, GWAS association, correlation",
  },
  T4: {
    tier: "T4",
    label: "Mention",
    stars: "☆☆☆",
    description: "Review mention, text-mined interaction, peripheral reference",
  },
};

export const MEDICAL_SKILLS_REGISTRY: MedicalSkill[] = [
  {
    id: "literature-review",
    name: "Systematic Literature Review",
    category: "evidence-synthesis",
    description: "Conduct comprehensive, systematic literature reviews across PubMed, arXiv, bioRxiv, Semantic Scholar with PRISMA compliance, citation verification, and professional PDF output.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/literature-review",
    integrated: true,
  },
  {
    id: "literature-deep-research",
    name: "Literature Deep Research",
    category: "research-pipeline",
    description: "Comprehensive literature research with target disambiguation, evidence grading (T1-T4), structured theme extraction, biological model synthesis, and testable hypotheses.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-literature-deep-research",
    integrated: true,
  },
  {
    id: "biomedical-search",
    name: "Biomedical Semantic Search",
    category: "database",
    description: "Complete biomedical information search combining PubMed, bioRxiv, medRxiv, ClinicalTrials.gov, and FDA drug labels via Valyu semantic search.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/biomedical-search",
    integrated: true,
  },
  {
    id: "clinical-trial-protocol",
    name: "Clinical Trial Protocol Designer",
    category: "protocol-generator",
    description: "Generate clinical trial protocols for medical devices or drugs with modular waypoint-based architecture, FDA guidance, and NIH-compliant protocol generation.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/clinical-trial-protocol-skill",
    integrated: true,
  },
  {
    id: "rnaseq-deseq2",
    name: "RNA-seq Differential Expression (PyDESeq2)",
    category: "omics-bioinformatics",
    description: "RNA-seq differential expression analysis using PyDESeq2: normalization, dispersion estimation, Wald testing, LFC shrinkage, and pathway enrichment.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-rnaseq-deseq2",
    integrated: true,
  },
  {
    id: "single-cell",
    name: "Single-cell RNA-seq (Scanpy/scVI)",
    category: "omics-bioinformatics",
    description: "Single-cell RNA-seq analysis using scanpy: QC, normalization, PCA, UMAP, Leiden clustering, trajectory analysis, and cell type annotation.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-single-cell",
    integrated: true,
  },
  {
    id: "spatial-transcriptomics",
    name: "Spatial Transcriptomics",
    category: "omics-bioinformatics",
    description: "Spatial transcriptomics data analysis mapping gene expression in tissue architecture. Supports 10x Visium, MERFISH, seqFISH, and Slide-seq platforms.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-spatial-transcriptomics",
    integrated: true,
  },
  {
    id: "multi-omics-integration",
    name: "Multi-Omics Integration",
    category: "omics-bioinformatics",
    description: "Integrate transcriptomics, proteomics, epigenomics, genomics, and metabolomics for systems biology and precision medicine.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-multi-omics-integration",
    integrated: true,
  },
  {
    id: "gwas-study-explorer",
    name: "GWAS Study Explorer & Meta-analysis",
    category: "omics-bioinformatics",
    description: "Compare GWAS studies and assess replication across cohorts. Integrates NHGRI-EBI GWAS Catalog and Open Targets Genetics for cross-study meta-analysis.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-gwas-study-explorer",
    integrated: true,
  },
  {
    id: "gwas-trait-to-gene",
    name: "GWAS Trait-to-Gene Discovery",
    category: "omics-bioinformatics",
    description: "Discover genes associated with diseases and traits using GWAS Catalog (500k+ associations) and Open Targets Genetics.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-gwas-trait-to-gene",
    integrated: true,
  },
  {
    id: "gene-enrichment",
    name: "Gene Set Enrichment & Pathways",
    category: "omics-bioinformatics",
    description: "Gene enrichment and pathway analysis using gseapy, PANTHER, STRING, Reactome. Supports GO enrichment, KEGG pathways, and 40+ ToolUniverse tools.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-gene-enrichment",
    integrated: true,
  },
  {
    id: "proteomics-analysis",
    name: "Proteomics & Mass Spectrometry",
    category: "omics-bioinformatics",
    description: "Mass spectrometry proteomics analysis: protein quantification, differential expression, PTMs, and protein-protein interaction network construction.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-proteomics-analysis",
    integrated: true,
  },
  {
    id: "metabolomics-analysis",
    name: "Metabolomics Analysis",
    category: "omics-bioinformatics",
    description: "Metabolomics data analysis: metabolite identification, quantification, pathway analysis, and metabolic flux from LC-MS, GC-MS, or NMR data.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-metabolomics-analysis",
    integrated: true,
  },
  {
    id: "epigenomics",
    name: "Epigenomics & Chromatin",
    category: "omics-bioinformatics",
    description: "Epigenomics data processing: methylation array analysis, chromatin accessibility, and histone modification analysis.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/tooluniverse-epigenomics",
    integrated: true,
  },
  {
    id: "clinical-trials-database",
    name: "Clinical Trials Database (ClinicalTrials.gov)",
    category: "database",
    description: "Query ClinicalTrials.gov via API v2. Search trials by condition, drug, location, status, or phase. Retrieve trial details by NCT ID.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/clinicaltrials-database",
    integrated: true,
  },
  {
    id: "chembl-search",
    name: "ChEMBL Bioactive Molecules",
    category: "database",
    description: "Search ChEMBL bioactive molecules database — compounds, assay data, and bioactivity via Valyu semantic search.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/chembl-search",
    integrated: true,
  },
  {
    id: "gwas-database",
    name: "GWAS Catalog Database",
    category: "database",
    description: "Query NHGRI-EBI GWAS Catalog for SNP-trait associations by rs ID, disease/trait, or gene. Retrieve p-values and summary statistics.",
    sourceRepo: "FreedomIntelligence/OpenClaw-Medical-Skills",
    skillPath: "skills/gwas-database",
    integrated: true,
  },
];

export function getSkillsByCategory(category: MedicalSkill["category"]): MedicalSkill[] {
  return MEDICAL_SKILLS_REGISTRY.filter((s) => s.category === category);
}

export function getSkillById(id: string): MedicalSkill | undefined {
  return MEDICAL_SKILLS_REGISTRY.find((s) => s.id === id);
}

export function getIntegratedSkills(): MedicalSkill[] {
  return MEDICAL_SKILLS_REGISTRY.filter((s) => s.integrated);
}
