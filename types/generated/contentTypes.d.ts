import type { Schema, Attribute } from '@strapi/strapi';

export interface AdminPermission extends Schema.CollectionType {
  collectionName: 'admin_permissions';
  info: {
    name: 'Permission';
    description: '';
    singularName: 'permission';
    pluralName: 'permissions';
    displayName: 'Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Attribute.JSON & Attribute.DefaultTo<{}>;
    subject: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    properties: Attribute.JSON & Attribute.DefaultTo<{}>;
    conditions: Attribute.JSON & Attribute.DefaultTo<[]>;
    role: Attribute.Relation<'admin::permission', 'manyToOne', 'admin::role'>;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminUser extends Schema.CollectionType {
  collectionName: 'admin_users';
  info: {
    name: 'User';
    description: '';
    singularName: 'user';
    pluralName: 'users';
    displayName: 'User';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    firstname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastname: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    username: Attribute.String;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.Private &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    resetPasswordToken: Attribute.String & Attribute.Private;
    registrationToken: Attribute.String & Attribute.Private;
    isActive: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    roles: Attribute.Relation<'admin::user', 'manyToMany', 'admin::role'> &
      Attribute.Private;
    blocked: Attribute.Boolean & Attribute.Private & Attribute.DefaultTo<false>;
    preferedLanguage: Attribute.String;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    updatedBy: Attribute.Relation<'admin::user', 'oneToOne', 'admin::user'> &
      Attribute.Private;
  };
}

export interface AdminRole extends Schema.CollectionType {
  collectionName: 'admin_roles';
  info: {
    name: 'Role';
    description: '';
    singularName: 'role';
    pluralName: 'roles';
    displayName: 'Role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    code: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String;
    users: Attribute.Relation<'admin::role', 'manyToMany', 'admin::user'>;
    permissions: Attribute.Relation<
      'admin::role',
      'oneToMany',
      'admin::permission'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    updatedBy: Attribute.Relation<'admin::role', 'oneToOne', 'admin::user'> &
      Attribute.Private;
  };
}

export interface AdminApiToken extends Schema.CollectionType {
  collectionName: 'strapi_api_tokens';
  info: {
    name: 'Api Token';
    singularName: 'api-token';
    pluralName: 'api-tokens';
    displayName: 'Api Token';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    type: Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Attribute.Required &
      Attribute.DefaultTo<'read-only'>;
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastUsedAt: Attribute.DateTime;
    permissions: Attribute.Relation<
      'admin::api-token',
      'oneToMany',
      'admin::api-token-permission'
    >;
    expiresAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::api-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_api_token_permissions';
  info: {
    name: 'API Token Permission';
    description: '';
    singularName: 'api-token-permission';
    pluralName: 'api-token-permissions';
    displayName: 'API Token Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    token: Attribute.Relation<
      'admin::api-token-permission',
      'manyToOne',
      'admin::api-token'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::api-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminTransferToken extends Schema.CollectionType {
  collectionName: 'strapi_transfer_tokens';
  info: {
    name: 'Transfer Token';
    singularName: 'transfer-token';
    pluralName: 'transfer-tokens';
    displayName: 'Transfer Token';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    description: Attribute.String &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Attribute.DefaultTo<''>;
    accessKey: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    lastUsedAt: Attribute.DateTime;
    permissions: Attribute.Relation<
      'admin::transfer-token',
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    expiresAt: Attribute.DateTime;
    lifespan: Attribute.BigInteger;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::transfer-token',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface AdminTransferTokenPermission extends Schema.CollectionType {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    name: 'Transfer Token Permission';
    description: '';
    singularName: 'transfer-token-permission';
    pluralName: 'transfer-token-permissions';
    displayName: 'Transfer Token Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    token: Attribute.Relation<
      'admin::transfer-token-permission',
      'manyToOne',
      'admin::transfer-token'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'admin::transfer-token-permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUploadFile extends Schema.CollectionType {
  collectionName: 'files';
  info: {
    singularName: 'file';
    pluralName: 'files';
    displayName: 'File';
    description: '';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    alternativeText: Attribute.String;
    caption: Attribute.String;
    width: Attribute.Integer;
    height: Attribute.Integer;
    formats: Attribute.JSON;
    hash: Attribute.String & Attribute.Required;
    ext: Attribute.String;
    mime: Attribute.String & Attribute.Required;
    size: Attribute.Decimal & Attribute.Required;
    url: Attribute.String & Attribute.Required;
    previewUrl: Attribute.String;
    provider: Attribute.String & Attribute.Required;
    provider_metadata: Attribute.JSON;
    related: Attribute.Relation<'plugin::upload.file', 'morphToMany'>;
    folder: Attribute.Relation<
      'plugin::upload.file',
      'manyToOne',
      'plugin::upload.folder'
    > &
      Attribute.Private;
    folderPath: Attribute.String &
      Attribute.Required &
      Attribute.Private &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::upload.file',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUploadFolder extends Schema.CollectionType {
  collectionName: 'upload_folders';
  info: {
    singularName: 'folder';
    pluralName: 'folders';
    displayName: 'Folder';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    pathId: Attribute.Integer & Attribute.Required & Attribute.Unique;
    parent: Attribute.Relation<
      'plugin::upload.folder',
      'manyToOne',
      'plugin::upload.folder'
    >;
    children: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.folder'
    >;
    files: Attribute.Relation<
      'plugin::upload.folder',
      'oneToMany',
      'plugin::upload.file'
    >;
    path: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::upload.folder',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginContentReleasesRelease extends Schema.CollectionType {
  collectionName: 'strapi_releases';
  info: {
    singularName: 'release';
    pluralName: 'releases';
    displayName: 'Release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    releasedAt: Attribute.DateTime;
    scheduledAt: Attribute.DateTime;
    timezone: Attribute.String;
    status: Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Attribute.Required;
    actions: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Schema.CollectionType {
  collectionName: 'strapi_release_actions';
  info: {
    singularName: 'release-action';
    pluralName: 'release-actions';
    displayName: 'Release Action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    type: Attribute.Enumeration<['publish', 'unpublish']> & Attribute.Required;
    entry: Attribute.Relation<
      'plugin::content-releases.release-action',
      'morphToOne'
    >;
    contentType: Attribute.String & Attribute.Required;
    locale: Attribute.String;
    release: Attribute.Relation<
      'plugin::content-releases.release-action',
      'manyToOne',
      'plugin::content-releases.release'
    >;
    isEntryValid: Attribute.Boolean;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::content-releases.release-action',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginI18NLocale extends Schema.CollectionType {
  collectionName: 'i18n_locale';
  info: {
    singularName: 'locale';
    pluralName: 'locales';
    collectionName: 'locales';
    displayName: 'Locale';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.SetMinMax<
        {
          min: 1;
          max: 50;
        },
        number
      >;
    code: Attribute.String & Attribute.Unique;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::i18n.locale',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Schema.CollectionType {
  collectionName: 'up_permissions';
  info: {
    name: 'permission';
    description: '';
    singularName: 'permission';
    pluralName: 'permissions';
    displayName: 'Permission';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Attribute.String & Attribute.Required;
    role: Attribute.Relation<
      'plugin::users-permissions.permission',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.permission',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole extends Schema.CollectionType {
  collectionName: 'up_roles';
  info: {
    name: 'role';
    description: '';
    singularName: 'role';
    pluralName: 'roles';
    displayName: 'Role';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    name: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    description: Attribute.String;
    type: Attribute.String & Attribute.Unique;
    permissions: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    users: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToMany',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.role',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface PluginUsersPermissionsUser extends Schema.CollectionType {
  collectionName: 'up_users';
  info: {
    name: 'user';
    description: '';
    singularName: 'user';
    pluralName: 'users';
    displayName: 'User';
  };
  options: {
    draftAndPublish: false;
    timestamps: true;
  };
  attributes: {
    username: Attribute.String &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    provider: Attribute.String & Attribute.Private;
    password: Attribute.Password &
      Attribute.Private &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    resetPasswordToken: Attribute.String & Attribute.Private;
    confirmationToken: Attribute.String & Attribute.Private;
    confirmed: Attribute.Boolean & Attribute.DefaultTo<false>;
    blocked: Attribute.Boolean & Attribute.Private & Attribute.DefaultTo<false>;
    role: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    email: Attribute.Email &
      Attribute.Required &
      Attribute.Unique &
      Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    projectEditor: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::project.project'
    >;
    projectReader: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::project.project'
    >;
    user_detail: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'api::user-detail.user-detail'
    >;
    checklistEditor: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::checklist.checklist'
    >;
    fundingReader: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::funding.funding'
    >;
    watchlists: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::watchlist.watchlist'
    >;
    checklistReader: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::checklist.checklist'
    >;
    fundingEditor: Attribute.Relation<
      'plugin::users-permissions.user',
      'manyToMany',
      'api::funding.funding'
    >;
    data_concents: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToMany',
      'api::data-concent.data-concent'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'plugin::users-permissions.user',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiCategoryCategory extends Schema.CollectionType {
  collectionName: 'categories';
  info: {
    singularName: 'category';
    pluralName: 'categories';
    displayName: 'category';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.String & Attribute.Required & Attribute.Unique;
    projects: Attribute.Relation<
      'api::category.category',
      'manyToMany',
      'api::project.project'
    >;
    checklists: Attribute.Relation<
      'api::category.category',
      'manyToMany',
      'api::checklist.checklist'
    >;
    fundings: Attribute.Relation<
      'api::category.category',
      'manyToMany',
      'api::funding.funding'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::category.category',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiChecklistChecklist extends Schema.CollectionType {
  collectionName: 'checklists';
  info: {
    singularName: 'checklist';
    pluralName: 'checklists';
    displayName: 'checklist';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.Text & Attribute.Required & Attribute.Unique;
    ideaProvider: Attribute.Enumeration<['volunteering', 'mainOffice']>;
    info: Attribute.Component<'project.info'>;
    project: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'api::project.project'
    >;
    editors: Attribute.Relation<
      'api::checklist.checklist',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    visibility: Attribute.Enumeration<
      ['only for me', 'all users', 'listed only']
    >;
    categories: Attribute.Relation<
      'api::checklist.checklist',
      'manyToMany',
      'api::category.category'
    >;
    tags: Attribute.Relation<
      'api::checklist.checklist',
      'manyToMany',
      'api::tag.tag'
    >;
    municipality: Attribute.Relation<
      'api::checklist.checklist',
      'manyToOne',
      'api::municipality.municipality'
    >;
    owner: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    funding: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'api::funding.funding'
    >;
    initialContact: Attribute.Component<'checklist.initial-contact'>;
    preparation: Attribute.Component<'checklist.preparation'>;
    fundingResearch: Attribute.Component<'checklist.funding-research'>;
    preparationOfProject: Attribute.Component<'checklist.preparation-of-project'>;
    legitimation: Attribute.Component<'checklist.legitimation'>;
    finalExamination: Attribute.Component<'checklist.final-examination'>;
    published: Attribute.Boolean;
    readers: Attribute.Relation<
      'api::checklist.checklist',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    media: Attribute.Media;
    archived: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    dupFrom: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'api::checklist.checklist'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::checklist.checklist',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiDataConcentDataConcent extends Schema.CollectionType {
  collectionName: 'data_concents';
  info: {
    singularName: 'data-concent';
    pluralName: 'data-concents';
    displayName: 'dataConcent';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    cKey: Attribute.Text & Attribute.Required & Attribute.Unique;
    consent: Attribute.JSON;
    user: Attribute.Relation<
      'api::data-concent.data-concent',
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::data-concent.data-concent',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::data-concent.data-concent',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiEmailingCenterEmailingCenter extends Schema.CollectionType {
  collectionName: 'emailing_centers';
  info: {
    singularName: 'emailing-center';
    pluralName: 'emailing-centers';
    displayName: 'emailing center';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    subject: Attribute.String & Attribute.Required;
    group: Attribute.String & Attribute.Required;
    status: Attribute.Boolean;
    attachments: Attribute.Media;
    body: Attribute.RichText & Attribute.Required;
    response: Attribute.JSON & Attribute.Private;
    groupName: Attribute.String;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::emailing-center.emailing-center',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::emailing-center.emailing-center',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiFundingFunding extends Schema.CollectionType {
  collectionName: 'fundings';
  info: {
    singularName: 'funding';
    pluralName: 'fundings';
    displayName: 'funding';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.Text & Attribute.Required & Attribute.Unique;
    info: Attribute.Component<'funding.info'>;
    details: Attribute.Component<'funding.details'>;
    provider: Attribute.Text;
    visibility: Attribute.Enumeration<
      ['only for me', 'all users', 'listed only']
    >;
    rates: Attribute.Component<'funding.rates', true>;
    accumulability: Attribute.Boolean;
    plannedStart: Attribute.Date;
    plannedEnd: Attribute.Date;
    assessment: Attribute.Text;
    notes: Attribute.Text;
    links: Attribute.Component<'funding.links', true>;
    media: Attribute.Media;
    files: Attribute.Media;
    published: Attribute.Boolean;
    editors: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    owner: Attribute.Relation<
      'api::funding.funding',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    categories: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'api::category.category'
    >;
    tags: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'api::tag.tag'
    >;
    fundingsLinkedTo: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'api::funding.funding'
    >;
    fundingsLinkedToMe: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'api::funding.funding'
    >;
    readers: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    projects: Attribute.Relation<
      'api::funding.funding',
      'manyToMany',
      'api::project.project'
    >;
    municipality: Attribute.Relation<
      'api::funding.funding',
      'manyToOne',
      'api::municipality.municipality'
    >;
    ownContribution: Attribute.Text;
    archived: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    funding_comments: Attribute.Relation<
      'api::funding.funding',
      'oneToMany',
      'api::funding-comment.funding-comment'
    >;
    read_notifications: Attribute.Relation<
      'api::funding.funding',
      'oneToMany',
      'api::read-notification.read-notification'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::funding.funding',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::funding.funding',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiFundingCommentFundingComment extends Schema.CollectionType {
  collectionName: 'funding_comments';
  info: {
    singularName: 'funding-comment';
    pluralName: 'funding-comments';
    displayName: 'fundingComment';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    comment: Attribute.Text & Attribute.Required;
    funding: Attribute.Relation<
      'api::funding-comment.funding-comment',
      'manyToOne',
      'api::funding.funding'
    >;
    owner: Attribute.Relation<
      'api::funding-comment.funding-comment',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    read_notifications: Attribute.Relation<
      'api::funding-comment.funding-comment',
      'oneToMany',
      'api::read-notification.read-notification'
    > &
      Attribute.Private;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::funding-comment.funding-comment',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::funding-comment.funding-comment',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiGuestRequestGuestRequest extends Schema.CollectionType {
  collectionName: 'guest_requests';
  info: {
    singularName: 'guest-request';
    pluralName: 'guest-requests';
    displayName: 'guestRequest';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    email: Attribute.Email;
    location: Attribute.String;
    name: Attribute.String;
    municipality: Attribute.Relation<
      'api::guest-request.guest-request',
      'manyToOne',
      'api::municipality.municipality'
    >;
    categories: Attribute.Relation<
      'api::guest-request.guest-request',
      'oneToMany',
      'api::category.category'
    >;
    read_notifications: Attribute.Relation<
      'api::guest-request.guest-request',
      'oneToMany',
      'api::read-notification.read-notification'
    > &
      Attribute.Private;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::guest-request.guest-request',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::guest-request.guest-request',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiLocationLocation extends Schema.CollectionType {
  collectionName: 'locations';
  info: {
    singularName: 'location';
    pluralName: 'locations';
    displayName: 'location';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.String & Attribute.Required & Attribute.Unique;
    municipality: Attribute.Relation<
      'api::location.location',
      'manyToOne',
      'api::municipality.municipality'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::location.location',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::location.location',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiMunicipalityMunicipality extends Schema.CollectionType {
  collectionName: 'municipalities';
  info: {
    singularName: 'municipality';
    pluralName: 'municipalities';
    displayName: 'municipality';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.String & Attribute.Required & Attribute.Unique;
    location: Attribute.String & Attribute.Required & Attribute.Unique;
    profile: Attribute.Media;
    projects: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::project.project'
    >;
    checklists: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::checklist.checklist'
    >;
    user_details: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::user-detail.user-detail'
    >;
    fundings: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::funding.funding'
    >;
    guest_requests: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::guest-request.guest-request'
    >;
    locations: Attribute.Relation<
      'api::municipality.municipality',
      'oneToMany',
      'api::location.location'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::municipality.municipality',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::municipality.municipality',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiProjectProject extends Schema.CollectionType {
  collectionName: 'projects';
  info: {
    singularName: 'project';
    pluralName: 'projects';
    displayName: 'project';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.Text & Attribute.Required & Attribute.Unique;
    info: Attribute.Component<'project.info'> & Attribute.Required;
    editors: Attribute.Relation<
      'api::project.project',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    owner: Attribute.Relation<
      'api::project.project',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    details: Attribute.Component<'project.details'> & Attribute.Required;
    estimatedCosts: Attribute.Component<'project.costs', true>;
    plannedStart: Attribute.Date;
    plannedEnd: Attribute.Date;
    links: Attribute.Component<'project.links', true>;
    media: Attribute.Media;
    categories: Attribute.Relation<
      'api::project.project',
      'manyToMany',
      'api::category.category'
    >;
    tags: Attribute.Relation<
      'api::project.project',
      'manyToMany',
      'api::tag.tag'
    >;
    published: Attribute.Boolean &
      Attribute.Required &
      Attribute.DefaultTo<false>;
    readers: Attribute.Relation<
      'api::project.project',
      'manyToMany',
      'plugin::users-permissions.user'
    >;
    visibility: Attribute.Enumeration<
      ['only for me', 'all users', 'listed only']
    >;
    municipality: Attribute.Relation<
      'api::project.project',
      'manyToOne',
      'api::municipality.municipality'
    >;
    files: Attribute.Media;
    fundingGuideline: Attribute.Relation<
      'api::project.project',
      'manyToMany',
      'api::funding.funding'
    >;
    archived: Attribute.Boolean &
      Attribute.Private &
      Attribute.DefaultTo<false>;
    dupFrom: Attribute.Relation<
      'api::project.project',
      'oneToOne',
      'api::project.project'
    >;
    checklists: Attribute.Relation<
      'api::project.project',
      'oneToMany',
      'api::checklist.checklist'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::project.project',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::project.project',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiReadNotificationReadNotification
  extends Schema.CollectionType {
  collectionName: 'read_notifications';
  info: {
    singularName: 'read-notification';
    pluralName: 'read-notifications';
    displayName: 'read notification';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    user: Attribute.Relation<
      'api::read-notification.read-notification',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    funding_expirey: Attribute.Relation<
      'api::read-notification.read-notification',
      'manyToOne',
      'api::funding.funding'
    > &
      Attribute.Private;
    funding_comment: Attribute.Relation<
      'api::read-notification.read-notification',
      'manyToOne',
      'api::funding-comment.funding-comment'
    > &
      Attribute.Private;
    guest_request: Attribute.Relation<
      'api::read-notification.read-notification',
      'manyToOne',
      'api::guest-request.guest-request'
    > &
      Attribute.Private;
    request: Attribute.Relation<
      'api::read-notification.read-notification',
      'manyToOne',
      'api::request.request'
    > &
      Attribute.Private;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::read-notification.read-notification',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::read-notification.read-notification',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiRequestRequest extends Schema.CollectionType {
  collectionName: 'requests';
  info: {
    singularName: 'request';
    pluralName: 'requests';
    displayName: 'request';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    user: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    project: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'api::project.project'
    >;
    approved: Attribute.Boolean & Attribute.DefaultTo<false>;
    funding: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'api::funding.funding'
    >;
    checklist: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'api::checklist.checklist'
    >;
    type: Attribute.Enumeration<['edit', 'view', 'duplicate']> &
      Attribute.Required;
    guest: Attribute.Boolean & Attribute.DefaultTo<false>;
    leaderApproved: Attribute.Boolean & Attribute.DefaultTo<false>;
    read_notifications: Attribute.Relation<
      'api::request.request',
      'oneToMany',
      'api::read-notification.read-notification'
    > &
      Attribute.Private;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::request.request',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiTagTag extends Schema.CollectionType {
  collectionName: 'tags';
  info: {
    singularName: 'tag';
    pluralName: 'tags';
    displayName: 'tag';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    title: Attribute.String & Attribute.Required & Attribute.Unique;
    projects: Attribute.Relation<
      'api::tag.tag',
      'manyToMany',
      'api::project.project'
    >;
    checklists: Attribute.Relation<
      'api::tag.tag',
      'manyToMany',
      'api::checklist.checklist'
    >;
    fundings: Attribute.Relation<
      'api::tag.tag',
      'manyToMany',
      'api::funding.funding'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<'api::tag.tag', 'oneToOne', 'admin::user'> &
      Attribute.Private;
    updatedBy: Attribute.Relation<'api::tag.tag', 'oneToOne', 'admin::user'> &
      Attribute.Private;
  };
}

export interface ApiUserDetailUserDetail extends Schema.CollectionType {
  collectionName: 'user_details';
  info: {
    singularName: 'user-detail';
    pluralName: 'user-details';
    displayName: 'user detail';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    fullName: Attribute.String;
    user: Attribute.Relation<
      'api::user-detail.user-detail',
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    phone: Attribute.String;
    location: Attribute.String;
    notifications: Attribute.Component<'user.app-notifications'>;
    contactPrivacy: Attribute.Boolean & Attribute.DefaultTo<false>;
    profile: Attribute.Media;
    municipality: Attribute.Relation<
      'api::user-detail.user-detail',
      'manyToOne',
      'api::municipality.municipality'
    >;
    postalCode: Attribute.String;
    streetNo: Attribute.String;
    categories: Attribute.Relation<
      'api::user-detail.user-detail',
      'oneToMany',
      'api::category.category'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::user-detail.user-detail',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::user-detail.user-detail',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

export interface ApiWatchlistWatchlist extends Schema.CollectionType {
  collectionName: 'watchlists';
  info: {
    singularName: 'watchlist';
    pluralName: 'watchlists';
    displayName: 'watchlist';
    description: '';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    owner: Attribute.Relation<
      'api::watchlist.watchlist',
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    project: Attribute.Relation<
      'api::watchlist.watchlist',
      'oneToOne',
      'api::project.project'
    >;
    checklist: Attribute.Relation<
      'api::watchlist.watchlist',
      'oneToOne',
      'api::checklist.checklist'
    >;
    funding: Attribute.Relation<
      'api::watchlist.watchlist',
      'oneToOne',
      'api::funding.funding'
    >;
    createdAt: Attribute.DateTime;
    updatedAt: Attribute.DateTime;
    createdBy: Attribute.Relation<
      'api::watchlist.watchlist',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
    updatedBy: Attribute.Relation<
      'api::watchlist.watchlist',
      'oneToOne',
      'admin::user'
    > &
      Attribute.Private;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface ContentTypes {
      'admin::permission': AdminPermission;
      'admin::user': AdminUser;
      'admin::role': AdminRole;
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
      'api::category.category': ApiCategoryCategory;
      'api::checklist.checklist': ApiChecklistChecklist;
      'api::data-concent.data-concent': ApiDataConcentDataConcent;
      'api::emailing-center.emailing-center': ApiEmailingCenterEmailingCenter;
      'api::funding.funding': ApiFundingFunding;
      'api::funding-comment.funding-comment': ApiFundingCommentFundingComment;
      'api::guest-request.guest-request': ApiGuestRequestGuestRequest;
      'api::location.location': ApiLocationLocation;
      'api::municipality.municipality': ApiMunicipalityMunicipality;
      'api::project.project': ApiProjectProject;
      'api::read-notification.read-notification': ApiReadNotificationReadNotification;
      'api::request.request': ApiRequestRequest;
      'api::tag.tag': ApiTagTag;
      'api::user-detail.user-detail': ApiUserDetailUserDetail;
      'api::watchlist.watchlist': ApiWatchlistWatchlist;
    }
  }
}
