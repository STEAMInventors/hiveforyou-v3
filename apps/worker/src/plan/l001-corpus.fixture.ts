/** Synthetic L001 snippets for Worker unit tests (mirrors experiments corpus). */
export type L001CorpusDocument = {
  source_document_id: string;
  filename: string;
  expected_document_type_id: string;
  pages: { page_number: number; text: string }[];
};

export const L001_CORPUS: L001CorpusDocument[] = [
  {
    source_document_id: "l001-01",
    filename: "01_initial_referral.pdf",
    expected_document_type_id: "iep.referral",
    pages: [
      {
        page_number: 1,
        text: "Referral for Special Education Evaluation\nReason for referral\nRequest for evaluation",
      },
    ],
  },
  {
    source_document_id: "l001-02",
    filename: "02_evaluation_plan.pdf",
    expected_document_type_id: "iep.evaluation.plan",
    pages: [
      {
        page_number: 1,
        text: "Evaluation Plan\nProposed assessments\nAreas to be assessed",
      },
    ],
  },
  {
    source_document_id: "l001-03",
    filename: "03_parent_evaluation_consent.pdf",
    expected_document_type_id: "iep.consent",
    pages: [
      {
        page_number: 1,
        text: "Parent Consent\nI give permission\nParent signature",
      },
    ],
  },
  {
    source_document_id: "l001-04",
    filename: "04_psychoeducational_evaluation.pdf",
    expected_document_type_id: "iep.evaluation.psychoeducational",
    pages: [
      {
        page_number: 1,
        text:
          "Psychoeducational Evaluation\npsychoeducational evaluation\nWISC\nschool psychologist\ncognitive processing",
      },
    ],
  },
  {
    source_document_id: "l001-05",
    filename: "05_academic_evaluation.pdf",
    expected_document_type_id: "iep.evaluation.academic",
    pages: [
      {
        page_number: 1,
        text: "Academic Evaluation\nWoodcock-Johnson\nachievement testing\nstandard score",
      },
    ],
  },
  {
    source_document_id: "l001-06",
    filename: "06_speech_language_evaluation.pdf",
    expected_document_type_id: "iep.evaluation.speech_language",
    pages: [
      {
        page_number: 1,
        text: "Speech-Language Evaluation\nCELF\narticulation\nSLP",
      },
    ],
  },
  {
    source_document_id: "l001-07",
    filename: "07_eligibility_determination.pdf",
    expected_document_type_id: "iep.eligibility",
    pages: [
      {
        page_number: 1,
        text:
          "Eligibility Determination\neligibility determination\neligibility report\nmeets criteria\ndisability category",
      },
    ],
  },
  {
    source_document_id: "l001-08",
    filename: "08_initial_iep.pdf",
    expected_document_type_id: "iep.plan",
    pages: [
      {
        page_number: 1,
        text: "Individualized Education Program\nIEP\nannual goals\npresent levels",
      },
      {
        page_number: 2,
        text: "special education services\nrelated services\naccommodations",
      },
    ],
  },
];
