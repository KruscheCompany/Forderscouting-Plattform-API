import type { Schema, Attribute } from '@strapi/strapi';

export interface ChecklistCaptureContect extends Schema.Component {
  collectionName: 'components_checklist_capture_contects';
  info: {
    displayName: 'captureContect';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
    sortPosition: Attribute.Integer;
  };
}

export interface ChecklistCaptureIdea extends Schema.Component {
  collectionName: 'components_checklist_capture_ideas';
  info: {
    displayName: 'captureIdea';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    project: Attribute.Relation<
      'checklist.capture-idea',
      'oneToOne',
      'api::project.project'
    >;
    file: Attribute.Media;
    sortPosition: Attribute.Integer &
      Attribute.Required &
      Attribute.DefaultTo<0>;
    active: Attribute.Boolean & Attribute.Required & Attribute.DefaultTo<false>;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCaptureNeeds extends Schema.Component {
  collectionName: 'components_checklist_capture_needs';
  info: {
    displayName: 'captureNeeds';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCaptureRequirements extends Schema.Component {
  collectionName: 'components_checklist_capture_requirements';
  info: {
    displayName: 'captureRequirements';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckContent extends Schema.Component {
  collectionName: 'components_checklist_check_contents';
  info: {
    displayName: 'checkContent';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    file: Attribute.Media;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckCooperations extends Schema.Component {
  collectionName: 'components_checklist_check_cooperations';
  info: {
    displayName: 'checkCooperations';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckDatabase extends Schema.Component {
  collectionName: 'components_checklist_check_databases';
  info: {
    displayName: 'checkDatabase';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckFunding extends Schema.Component {
  collectionName: 'components_checklist_check_fundings';
  info: {
    displayName: 'checkFunding';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckGuildlines extends Schema.Component {
  collectionName: 'components_checklist_check_guildlines';
  info: {
    displayName: 'checkGuildlines';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    file: Attribute.Media;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckPlanning extends Schema.Component {
  collectionName: 'components_checklist_check_plannings';
  info: {
    displayName: 'checkPlanning';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckSimilarProejcts extends Schema.Component {
  collectionName: 'components_checklist_check_similar_proejcts';
  info: {
    displayName: 'checkSimilarProejcts';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistCheckWithFunding extends Schema.Component {
  collectionName: 'components_checklist_check_with_fundings';
  info: {
    displayName: 'checkWithFunding';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    file: Attribute.Media;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistFinalExamination extends Schema.Component {
  collectionName: 'components_checklist_final_examinations';
  info: {
    displayName: 'finalExamination';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    revision: Attribute.Component<'checklist.revision'>;
    signatures: Attribute.Component<'checklist.signatures'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<' '>;
  };
}

export interface ChecklistFundingResearch extends Schema.Component {
  collectionName: 'components_checklist_funding_researches';
  info: {
    displayName: 'fundingResearch';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    checkDatabase: Attribute.Component<'checklist.check-database'>;
    checkForFunding: Attribute.Component<'checklist.check-funding'>;
    checkWithFunding: Attribute.Component<'checklist.check-with-funding'>;
    checkGuildlines: Attribute.Component<'checklist.check-guildlines'>;
    selectFunding: Attribute.Component<'funding.select-funding'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<' '>;
  };
}

export interface ChecklistInitialContact extends Schema.Component {
  collectionName: 'components_checklist_initial_contacts';
  info: {
    displayName: 'initialContact';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    captureIdea: Attribute.Component<'checklist.capture-idea'>;
    caputreContect: Attribute.Component<'checklist.capture-contect'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<'  '>;
  };
}

export interface ChecklistInspection extends Schema.Component {
  collectionName: 'components_checklist_inspections';
  info: {
    displayName: 'inspection';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    file: Attribute.Media;
    tasks: Attribute.JSON;
    active: Attribute.Boolean;
  };
}

export interface ChecklistLegitimation extends Schema.Component {
  collectionName: 'components_checklist_legitimations';
  info: {
    displayName: 'legitimation';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    template: Attribute.Component<'checklist.template'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<' '>;
  };
}

export interface ChecklistPreparationOfProject extends Schema.Component {
  collectionName: 'components_checklist_preparation';
  info: {
    displayName: 'preparationOfProject';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    checkContent: Attribute.Component<'checklist.check-content'>;
    checkCooperations: Attribute.Component<'checklist.check-cooperations'>;
    checkSimilarProejcts: Attribute.Component<'checklist.check-similar-proejcts'>;
    checkPlanning: Attribute.Component<'checklist.check-planning'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<' '>;
  };
}

export interface ChecklistPreparation extends Schema.Component {
  collectionName: 'components_checklist_preparations';
  info: {
    displayName: 'preparation';
    description: '';
  };
  attributes: {
    start: Attribute.Date;
    end: Attribute.Date;
    inspection: Attribute.Component<'checklist.inspection'>;
    captureRequirements: Attribute.Component<'checklist.capture-requirements'>;
    captureNeeds: Attribute.Component<'checklist.capture-needs'>;
    responsiblePerson: Attribute.String & Attribute.DefaultTo<' '>;
  };
}

export interface ChecklistRevision extends Schema.Component {
  collectionName: 'components_checklist_revisions';
  info: {
    displayName: 'revision';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    active: Attribute.Boolean;
    sortPosition: Attribute.Integer;
    file: Attribute.Media;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistSignatures extends Schema.Component {
  collectionName: 'components_checklist_signatures';
  info: {
    displayName: 'signatures';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    sortPosition: Attribute.Integer;
    file: Attribute.Media;
    active: Attribute.Boolean;
    tasks: Attribute.JSON;
  };
}

export interface ChecklistTemplate extends Schema.Component {
  collectionName: 'components_checklist_templates';
  info: {
    displayName: 'template';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    text: Attribute.Text;
    file: Attribute.Media;
    active: Attribute.Boolean;
    tasks: Attribute.JSON;
  };
}

export interface FundingDetails extends Schema.Component {
  collectionName: 'components_funding_details';
  info: {
    displayName: 'details';
    icon: 'apple-alt';
    description: '';
  };
  attributes: {
    goal: Attribute.Text;
    funded: Attribute.Text;
    notFunded: Attribute.Text;
    willBeFunded: Attribute.Text;
    condition: Attribute.Text;
  };
}

export interface FundingInfo extends Schema.Component {
  collectionName: 'components_funding_infos';
  info: {
    displayName: 'info';
    description: '';
  };
  attributes: {
    contactName: Attribute.Text;
    phone: Attribute.Text;
    email: Attribute.Text;
    streetNo: Attribute.Text;
    postalCode: Attribute.Text;
    location: Attribute.String;
  };
}

export interface FundingLinks extends Schema.Component {
  collectionName: 'components_funding_links';
  info: {
    displayName: 'links';
    description: '';
  };
  attributes: {
    title: Attribute.Text;
    link: Attribute.Text;
  };
}

export interface FundingRates extends Schema.Component {
  collectionName: 'components_funding_rates';
  info: {
    displayName: 'rates';
    icon: 'dollar-sign';
    description: '';
  };
  attributes: {
    content: Attribute.Text;
    amount: Attribute.Text;
  };
}

export interface FundingSelectFunding extends Schema.Component {
  collectionName: 'components_funding_select_fundings';
  info: {
    displayName: 'selectFunding';
    description: '';
  };
  attributes: {
    active: Attribute.Boolean & Attribute.DefaultTo<false>;
    name: Attribute.String;
    text: Attribute.String;
    file: Attribute.Media;
    tasks: Attribute.JSON;
    sortPosition: Attribute.Integer;
  };
}

export interface NotificationsApp extends Schema.Component {
  collectionName: 'components_notifications_apps';
  info: {
    displayName: 'app';
    icon: 'globe-europe';
    description: '';
  };
  attributes: {
    dataRequests: Attribute.Boolean & Attribute.DefaultTo<true>;
    fundingExpiry: Attribute.Boolean & Attribute.DefaultTo<true>;
    userJoinRequest: Attribute.Boolean & Attribute.DefaultTo<true>;
    fundingComments: Attribute.Boolean & Attribute.DefaultTo<true>;
  };
}

export interface NotificationsEmail extends Schema.Component {
  collectionName: 'components_notifications_emails';
  info: {
    displayName: 'email';
    icon: 'envelope';
    description: '';
  };
  attributes: {
    dataRequests: Attribute.Boolean & Attribute.DefaultTo<true>;
    fundingExpiry: Attribute.Boolean & Attribute.DefaultTo<true>;
    userJoinRequest: Attribute.Boolean & Attribute.DefaultTo<true>;
    fundingComments: Attribute.Boolean & Attribute.DefaultTo<true>;
  };
}

export interface ProjectCatAndTag extends Schema.Component {
  collectionName: 'components_project_cat_and_tags';
  info: {
    displayName: 'cat&tag';
    icon: 'code-branch';
  };
  attributes: {
    categories: Attribute.Relation<
      'project.cat-and-tag',
      'oneToMany',
      'api::category.category'
    >;
    tags: Attribute.Relation<
      'project.cat-and-tag',
      'oneToMany',
      'api::tag.tag'
    >;
  };
}

export interface ProjectCosts extends Schema.Component {
  collectionName: 'components_project_costs';
  info: {
    displayName: 'costs';
    icon: 'euro-sign';
    description: '';
  };
  attributes: {
    name: Attribute.Text;
    price: Attribute.Text;
  };
}

export interface ProjectDetails extends Schema.Component {
  collectionName: 'components_project_details';
  info: {
    displayName: 'details';
    icon: 'file-alt';
    description: '';
  };
  attributes: {
    content: Attribute.Text & Attribute.Required;
    goals: Attribute.Text & Attribute.Required;
    valuesAndBenefits: Attribute.Text & Attribute.Required;
    partner: Attribute.Text;
    investive: Attribute.Boolean & Attribute.Required;
    status: Attribute.Enumeration<
      ['Idea', 'Development', 'Pre-Planning', 'Detailed-Planning']
    >;
    startingCondition: Attribute.Text & Attribute.Required;
  };
}

export interface ProjectInfo extends Schema.Component {
  collectionName: 'components_project_infos';
  info: {
    displayName: 'info';
    icon: 'money-check';
    description: '';
  };
  attributes: {
    location: Attribute.Text;
  };
}

export interface ProjectLinks extends Schema.Component {
  collectionName: 'components_project_links';
  info: {
    displayName: 'links';
    icon: 'external-link-alt';
    description: '';
  };
  attributes: {
    title: Attribute.Text;
    link: Attribute.Text;
  };
}

export interface UserAppNotifications extends Schema.Component {
  collectionName: 'components_user_app_notifications';
  info: {
    displayName: 'notifications';
    icon: 'bell';
    description: '';
  };
  attributes: {
    app: Attribute.Component<'notifications.app'>;
    email: Attribute.Component<'notifications.email'>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'checklist.capture-contect': ChecklistCaptureContect;
      'checklist.capture-idea': ChecklistCaptureIdea;
      'checklist.capture-needs': ChecklistCaptureNeeds;
      'checklist.capture-requirements': ChecklistCaptureRequirements;
      'checklist.check-content': ChecklistCheckContent;
      'checklist.check-cooperations': ChecklistCheckCooperations;
      'checklist.check-database': ChecklistCheckDatabase;
      'checklist.check-funding': ChecklistCheckFunding;
      'checklist.check-guildlines': ChecklistCheckGuildlines;
      'checklist.check-planning': ChecklistCheckPlanning;
      'checklist.check-similar-proejcts': ChecklistCheckSimilarProejcts;
      'checklist.check-with-funding': ChecklistCheckWithFunding;
      'checklist.final-examination': ChecklistFinalExamination;
      'checklist.funding-research': ChecklistFundingResearch;
      'checklist.initial-contact': ChecklistInitialContact;
      'checklist.inspection': ChecklistInspection;
      'checklist.legitimation': ChecklistLegitimation;
      'checklist.preparation-of-project': ChecklistPreparationOfProject;
      'checklist.preparation': ChecklistPreparation;
      'checklist.revision': ChecklistRevision;
      'checklist.signatures': ChecklistSignatures;
      'checklist.template': ChecklistTemplate;
      'funding.details': FundingDetails;
      'funding.info': FundingInfo;
      'funding.links': FundingLinks;
      'funding.rates': FundingRates;
      'funding.select-funding': FundingSelectFunding;
      'notifications.app': NotificationsApp;
      'notifications.email': NotificationsEmail;
      'project.cat-and-tag': ProjectCatAndTag;
      'project.costs': ProjectCosts;
      'project.details': ProjectDetails;
      'project.info': ProjectInfo;
      'project.links': ProjectLinks;
      'user.app-notifications': UserAppNotifications;
    }
  }
}
