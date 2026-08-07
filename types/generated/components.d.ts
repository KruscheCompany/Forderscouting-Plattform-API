import type { Schema, Attribute } from '@strapi/strapi';

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
    contactFirstName: Attribute.Text;
    contactLastName: Attribute.Text;
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

export interface ProjectCostAndFinance extends Schema.Component {
  collectionName: 'components_project_cost_and_finances';
  info: {
    displayName: 'costAndFinance';
    icon: 'arrowUp';
    description: '';
  };
  attributes: {
    title: Attribute.String;
    value: Attribute.String;
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
    goals: Attribute.Text;
    valuesAndBenefits: Attribute.Text & Attribute.Required;
    partner: Attribute.Text;
    investive: Attribute.Boolean & Attribute.Required;
    status: Attribute.Enumeration<
      ['Idea', 'Development', 'Pre-Planning', 'Detailed-Planning']
    >;
    startingCondition: Attribute.Text & Attribute.Required;
    timeline: Attribute.Text;
    uploadDescription: Attribute.Text;
    aptitude: Attribute.Text;
    decision: Attribute.Text;
    siteVisit: Attribute.Text;
    requirements: Attribute.Text;
    projectDevelopmentGoals: Attribute.Text;
    guidelineContentCheck: Attribute.Text;
    guidelineFormCheck: Attribute.Text;
    goalsAndRequirements: Attribute.Text;
    guidelineCheck: Attribute.Text;
    documentsCoordination: Attribute.Text;
  };
}

export interface ProjectFinancialPlan extends Schema.Component {
  collectionName: 'components_project_financial_plans';
  info: {
    displayName: 'financialPlan';
    icon: 'alien';
    description: '';
  };
  attributes: {
    costAndFinance: Attribute.Component<'project.cost-and-finance', true>;
    description: Attribute.Text;
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
      'funding.details': FundingDetails;
      'funding.info': FundingInfo;
      'funding.links': FundingLinks;
      'funding.rates': FundingRates;
      'funding.select-funding': FundingSelectFunding;
      'notifications.app': NotificationsApp;
      'notifications.email': NotificationsEmail;
      'project.cat-and-tag': ProjectCatAndTag;
      'project.cost-and-finance': ProjectCostAndFinance;
      'project.costs': ProjectCosts;
      'project.details': ProjectDetails;
      'project.financial-plan': ProjectFinancialPlan;
      'project.info': ProjectInfo;
      'project.links': ProjectLinks;
      'user.app-notifications': UserAppNotifications;
    }
  }
}
