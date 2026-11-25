# Graph Report - estoque-webapp  (2026-07-27)

## Corpus Check
- 149 files · ~167,592 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2616 nodes · 4319 edges · 153 communities (125 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0ba2c99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MovimentacoesView.vue
- Service Order Management
- MotoresView.vue
- InventarioView.vue
- App.vue
- api.js
- DestinationsTab.vue
- Catalog and Categories View
- PhotoMovementTab.vue
- EpisTab.vue
- PeopleTab.vue
- useItems.js
- Item Variation Sheet
- Supplier Management
- DashboardView.vue
- FechamentosView.vue
- User Access Control
- scripts
- EpiControlTab.vue
- Role Management
- photoMovementDrafts.js
- workOrders.js
- db.js
- AI Catalog Assistant
- validateOsForm
- Backup and Dev Scripts
- DestinationTreePicker.vue
- index.js
- DestinationSummaryPanel.vue
- commitQuickAutocomplete
- Photo Batch Storage
- photoMovement.js
- refactors.test.js
- movements.js
- Location Management
- Destination Context Actions
- Person Picker Component
- useMotors.js
- Motor Event Mapping
- usePeople.js
- pad
- promotePeopleRoles.js
- handleStorageError
- Inventory Export Utilities
- Catalog Navigation Actions
- focusRef
- Hierarchy Edit State
- LoginModal.vue
- Environment and Restore
- Material Rule Logic
- History Filter Sidebar
- Order Formatting Utilities
- resetOsForm
- Global Keyboard Shortcuts
- Motor Work Order Flow
- confirmCurrentMovement
- EpiSheetDialog.vue
- Seed Data Generation
- useTheme.js
- Toast Notifications
- Variation Form Logic
- Destination Data Mapping
- all.js
- AI Suggestion Schema
- failedSourceNames
- Hierarchy Selector Path
- Hierarchy Edit Dialog
- EPI Data Hooks
- motorEventLabel
- Image Processing Utilities
- Document Field Component
- Destination Summary Hooks
- formatDate
- General CSV Export
- navigateTab
- AppButton.vue
- MotorPicker.vue
- Status Badge Component
- Closing Data Hooks
- Direct Variation Setup
- epiSheet.js
- Material Search Logic
- Material Navigation State
- CatalogPendingTab.vue
- Location Data Hooks
- Work Order Hooks
- parsePeopleCsv
- Stock Adjustment Logic
- Hierarchy Search Selection
- useMovementHistory.js
- Server Lifecycle Scripts
- Q: Por que useToast e useItems conectam tantas comunidades?
- Movement Statistics Logic
- Material Step Navigation
- Q: As conexões inferidas com key() são reais?
- Sidebar Section Toggle
- Attribute Badge Component
- Movement Data Hooks
- useAuth.js
- Dropdown Positioning Styles
- Quick Movement Actions
- Movement Metadata Display
- Movement Work Order Links
- Material Variation Options
- Motor Material Selection
- Supplier Selection Logic
- Movement Edit Helpers
- UI Component Tests
- Project Documentation
- Interface Design Specs
- UI State Management
- Q: Os módulos de movimentações e ordens de serviço devem ser divididos?
- Q: O que acha do grafo? está bom? está profissional? comercial? esse é o aspecto q o sistema passa?
- Q: Como eu posso explicar o grafo pra alguém?
- Item Card Component
- Hierarchy Structure Logic
- Stock Status UI
- Destination Selection Logic
- Local Selection Logic
- Q: Qual parte do shell causa o overflow e a navegação ruim no celular?
- Auto Hierarchy Logic
- Hierarchy Search Logic
- Table Column Visibility
- Person Selection Handling
- Supplier Selection Handling
- Quick Entry Search
- Quick Entry Supplier
- Quick Exit Person
- Quick Exit Search
- Requested Person Selection
- normalizeSearchText
- Q: consegue arrumar pra celular?, principalmente onde você ache que mais vai ter fluxo de aparelho móvel utilizando
- Q: ta vazando no celular
- compareText
- rowsToCsv
- duplicateSignatureFromOrder
- selectDestination
- isOrderFinished
- people.js
- AppModal.vue
- useRoles.js
- closeMobileSidebar
- makeItemTarget
- itemStock
- makeVariationTarget
- formatMonth

## God Nodes (most connected - your core abstractions)
1. `request()` - 92 edges
2. `normalizeSearchText()` - 47 edges
3. `useItems()` - 29 edges
4. `useToast()` - 22 edges
5. `db` - 19 edges
6. `requireAuth()` - 18 edges
7. `scripts` - 17 edges
8. `useEditHierarchyState()` - 16 edges
9. `useDestinations()` - 15 edges
10. `commitQuickAutocomplete()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `useMotors()` --indirect_call--> `addMotorEvent()`  [INFERRED]
  src/composables/useMotors.js → server/routes/workOrders.js
- `useItems()` --indirect_call--> `key()`  [INFERRED]
  src/composables/useItems.js → server/scripts/promotePeopleRoles.js
- `useMovementHistory()` --indirect_call--> `key()`  [INFERRED]
  src/composables/useMovementHistory.js → server/scripts/promotePeopleRoles.js
- `localDeleteBatch()` --indirect_call--> `key()`  [INFERRED]
  src/services/photoMovementDrafts.js → server/scripts/promotePeopleRoles.js
- `toPhotoStorageRecord()` --indirect_call--> `key()`  [INFERRED]
  src/services/photoMovementDrafts.js → server/scripts/promotePeopleRoles.js

## Import Cycles
- None detected.

## Communities (153 total, 28 thin omitted)

### Community 0 - "MovimentacoesView.vue"
Cohesion: 0.01
Nodes (126): { activePeople }, activeQuickMovementType, activeSubTab, { activeSuppliers, ensureSupplier }, appliedPrefillKey, canConfirm, canOperate, canSaveEditMovement (+118 more)

### Community 1 - "Service Order Management"
Cohesion: 0.01
Nodes (115): activeMotorFilterId, { activePeople, addPerson }, activeSubTab, addingMaterialToId, baseQuickOsFields, cancelAddMaterial(), canManageOs, canOperate (+107 more)

### Community 2 - "MotoresView.vue"
Cohesion: 0.02
Nodes (80): availableMotorMaterialRows, canManageMotorOrders, canOperate, collator, confirmCreateMotor, confirmDeleteMotorId, { destinations, groupedDestinations, getDestFullName }, editingMotorId (+72 more)

### Community 3 - "InventarioView.vue"
Cohesion: 0.02
Nodes (76): activeHeaderSearch, adjustingId, adjustInput, adjustValue, afterHierarchy, afterStatusSearch, alertRows, allRows (+68 more)

### Community 4 - "App.vue"
Cohesion: 0.02
Nodes (83): actionShortcuts, activeNavigationGroup, { activePeople, loadData: loadPeople }, activeTab, activeTabLabel, anySidebar, backupHealth, CadastrosView (+75 more)

### Community 5 - "api.js"
Cohesion: 0.05
Nodes (81): addWorkOrderItem(), createDestination(), createEpiPeriodicity(), createEpiRoleRule(), createItem(), createLocation(), createMotor(), createMotorEvent() (+73 more)

### Community 6 - "DestinationsTab.vue"
Cohesion: 0.03
Nodes (59): {
  addDestination,
  editDestination,
  toggleDestinationActive,
  deleteDestination,
  destinations,
  topLevelDestinations,
  getDestChildren,
  getDestDescendants,
  getDestFullName,
}, addingDest, addingMaterial, allCurrentScopePending, canLinkMaterial, contextMenu, contextMenuFirstRef, contextMenuRef (+51 more)

### Community 7 - "Catalog and Categories View"
Cohesion: 0.03
Nodes (59): { activeDestinations, groupedDestinations, getDestinationName, getDestFullName }, { activeLocais, groupedLocais, getFullName }, addingVariation, aiCatalogOpen, aiCatalogSearchOpen, autoDrilling, canOperate, catalogIndex (+51 more)

### Community 8 - "PhotoMovementTab.vue"
Cohesion: 0.03
Nodes (55): addCatalogAttribute(), { addMovementBatch }, batches, batchPickerOpen, blockReason, cancelCatalog(), canDeleteCurrentBatch, canEditCurrentBatch (+47 more)

### Community 9 - "EpisTab.vue"
Cohesion: 0.04
Nodes (34): { activeRoles }, activeRuleCount, catalogTargets, categoriesForGroup, filteredRoles, groups, isLoggedIn, itemById (+26 more)

### Community 10 - "PeopleTab.vue"
Cohesion: 0.04
Nodes (39): addingPerson, allPagePeopleSelected, bulkDeleting, canAddPerson, canEditPerson, csvImporting, csvImportSummary, csvInput (+31 more)

### Community 11 - "useItems.js"
Cohesion: 0.10
Nodes (28): activeCategory, activeFilters, activeGroup, activeSubcategory, collator, compareText(), _findDuplicateItem(), _hasDuplicateVariation() (+20 more)

### Community 12 - "Item Variation Sheet"
Cohesion: 0.04
Nodes (42): activeTab, adjustOpen, adjustValue, canSetInitialStock, dialogRef, editForm, editSaving, { editVariation } (+34 more)

### Community 13 - "Supplier Management"
Cohesion: 0.06
Nodes (33): adding, canAddSupplier, canEditSupplier, editDescription, editingId, editName, filteredSuppliers, newDescription (+25 more)

### Community 14 - "DashboardView.vue"
Cohesion: 0.04
Nodes (36): canOperate, { closings }, consumedCurrentPage, consumedPage, consumedTotalPages, currentMonthKey, dashboardActions, dashboardCopy (+28 more)

### Community 15 - "FechamentosView.vue"
Cohesion: 0.07
Nodes (21): attentionRows, { closings, closingDetails, createClosing, deleteClosing, loadClosing, previewClosing }, deletingId, existingPeriodClosing, exporting, { getDestFullName }, isAdmin, loading (+13 more)

### Community 16 - "User Access Control"
Cohesion: 0.05
Nodes (31): addingUser, canEditUserPassword(), confirmEditUser(), editingUserId, editUserName, editUserPin, editUserRole, editUserUsername (+23 more)

### Community 17 - "scripts"
Cohesion: 0.04
Nodes (44): bcryptjs, better-sqlite3, cors, express, allowScripts, better-sqlite3@12.11.1, esbuild@0.25.12, dependencies (+36 more)

### Community 18 - "EpiControlTab.vue"
Cohesion: 0.05
Nodes (35): { activeRoleRules, activePeriodicities }, counts, currentPage, currentPersonStatusFilterLabel, currentStatusFilterLabel, emit, filteredRecords, filterMenuPosition (+27 more)

### Community 19 - "Role Management"
Cohesion: 0.05
Nodes (27): addingRole, allPageRolesSelected, bulkDeleting, canAddRole, canEditRole, currentPage, editingRoleId, editRoleDesc (+19 more)

### Community 20 - "photoMovementDrafts.js"
Cohesion: 0.19
Nodes (32): confirmBatch(), deleteRemoteBatchPhoto(), deleteRemotePhotoBatch(), getPhotoBatches(), getPhotoBatchImage(), getPhotoBatchPhotos(), applyRecord(), cleanupExpiredPhotoBatches() (+24 more)

### Community 21 - "workOrders.js"
Cohesion: 0.11
Nodes (25): addMotorEvent(), addWorkOrderEvent(), applyMotorEventEffect(), buildMaintenanceLocation(), buildTitle(), clean(), genId(), mapWorkOrder() (+17 more)

### Community 22 - "db.js"
Cohesion: 0.11
Nodes (17): databaseExisted, db, __dirname, ENV_FILE, migrateSchema, previousSchemaVersion, requireAdmin, requireAuth() (+9 more)

### Community 23 - "AI Catalog Assistant"
Cohesion: 0.10
Nodes (27): aiCatalog, aiCatalogAttrInput, aiCatalogError, aiCatalogFoundItem, aiCatalogImage, aiCatalogLoading, aiCatalogMatchedVariation, aiCatalogNew (+19 more)

### Community 24 - "validateOsForm"
Cohesion: 0.12
Nodes (21): formatPartialOrderDate(), workOrderCreationDateError(), compactDateCandidate(), ensureQuickAutoRegistries(), focusPreviousQuickOsField(), focusQuickOsField(), formatQuickDateForInput(), handleCreateOS() (+13 more)

### Community 25 - "Backup and Dev Scripts"
Cohesion: 0.13
Nodes (19): cleanupOldBackups(), createBackup(), DEFAULT_BACKUP_DIR, __dirname, envInt(), getBackupSettings(), startBackupScheduler(), timestamp() (+11 more)

### Community 26 - "DestinationTreePicker.vue"
Cohesion: 0.10
Nodes (21): chooseOther(), clearSelection(), destinationSource, emit, entityLabel, expandedGroups, filteredCount, filteredGroups (+13 more)

### Community 27 - "index.js"
Cohesion: 0.10
Nodes (18): app, __dirname, distPath, server, allowedOrigins(), apiErrorHandler(), corsMiddleware(), loginAttempts (+10 more)

### Community 28 - "DestinationSummaryPanel.vue"
Cohesion: 0.09
Nodes (21): closeHistory(), emit, filteredHistoryRows, hasHistoryFilters, historyCategory, historyCategoryOptions, historyDateFrom, historyDateTo (+13 more)

### Community 29 - "commitQuickAutocomplete"
Cohesion: 0.15
Nodes (25): applyQuickSuggestion(), chooseQuickSuggestion(), commitQuickAutocomplete(), ensureQuickDestinationRegistered(), ensureQuickPersonRegistered(), findDestinationIdByEquipment(), findQuickAutocompleteMatch(), focusNextQuickOsField() (+17 more)

### Community 30 - "Photo Batch Storage"
Cohesion: 0.14
Nodes (19): BATCH_STATUSES, batchPayload(), batchRecord(), cleanupExpired(), __dirname, object(), parseJson(), persistVariationPhotos() (+11 more)

### Community 31 - "photoMovement.js"
Cohesion: 0.17
Nodes (20): processQueue(), toggleBatchEditing(), toggleOverrides(), updateUnitCost(), buildPhotoMovementLine(), canDeletePhotoBatch(), canEditPhotoBatch(), displayPhotoUnitCost() (+12 more)

### Community 32 - "refactors.test.js"
Cohesion: 0.29
Nodes (8): collator, destinationDescendants(), destinationMoveError(), destinations, sortByName(), useDestinations(), workOrderMaintenanceKindLabel(), workOrderMaintenanceSearchParts()

### Community 33 - "movements.js"
Cohesion: 0.17
Nodes (14): clean(), findActiveDestinationByName(), prepareNewCatalog(), validateMovementDestination(), validateMovementPerson(), validateMovementSupplier(), resolveDestinationName(), findDuplicateItem() (+6 more)

### Community 34 - "Location Management"
Cohesion: 0.09
Nodes (13): addingLocal, { addLocal, editLocal, toggleLocalActive, deleteLocal, topLevelLocais, getChildren }, canAddLocal, canEditLocal, collapsedLocais, editingLocalId, editLocalDesc, editLocalName (+5 more)

### Community 35 - "Destination Context Actions"
Cohesion: 0.13
Nodes (19): cancelAddDest(), cancelEditDest(), cancelMoveDest(), closeContextMenu(), confirmAddDest(), confirmEditDest(), confirmMoveDest(), deleteContextDestination() (+11 more)

### Community 36 - "Person Picker Component"
Cohesion: 0.15
Nodes (14): { activePeople }, clearSelection(), emit, filteredPeople, handleEnter(), handleInput(), inputEl, open (+6 more)

### Community 37 - "useMotors.js"
Cohesion: 0.20
Nodes (10): buildMotorDestinationTree(), MOTOR_EVENT_TYPES, MOTOR_OPEN_EVENT_LABELS, MOTOR_STATUSES, motorEvents, motorMatchesSearch(), motorMaterials, motors (+2 more)

### Community 38 - "Motor Event Mapping"
Cohesion: 0.22
Nodes (12): addWorkOrderEvent(), buildEventPayload(), buildMotorPayload(), clean(), EVENT_TYPES, genId(), MOTOR_STATUSES, normalizePowerUnit() (+4 more)

### Community 39 - "usePeople.js"
Cohesion: 0.29
Nodes (8): collator, people, PERSON_STATUSES, personStatusLabel(), sortByName(), usePeople(), formatPersonName(), formatRoleName()

### Community 40 - "pad"
Cohesion: 0.22
Nodes (15): formatDate(), createEmptyOsForm(), currentTime(), dateInputValue(), dateParts(), destinationIdForName(), emptyMotorEventForm(), inferEquipment() (+7 more)

### Community 41 - "promotePeopleRoles.js"
Cohesion: 0.25
Nodes (11): assertPromoteAllowed(), assertRequiredTables(), chooseId(), generateId(), main(), PERSON_STATUSES, promotePeopleRoles(), readEnvFile() (+3 more)

### Community 42 - "handleStorageError"
Cohesion: 0.23
Nodes (13): clearObjectUrls(), createBatch(), handleStorageError(), initialize(), onFilesSelected(), refreshBatches(), refreshPhotos(), removeBatch() (+5 more)

### Community 43 - "Inventory Export Utilities"
Cohesion: 0.19
Nodes (16): applyAttrFilters(), compareInventoryRows(), compareItemColumn(), compareNumber(), compareSortColumn(), compareStatus(), compareText(), exportCSV() (+8 more)

### Community 44 - "Catalog Navigation Actions"
Cohesion: 0.16
Nodes (15): closeItem(), emit, goToCategory(), goToGroup(), goToRoot(), goToSubcategory(), onAiCatalogFound(), onAiCatalogSaved() (+7 more)

### Community 45 - "focusRef"
Cohesion: 0.17
Nodes (16): adaptFormForSubTab(), addQuickEntryLine(), addQuickExitLine(), applyDestinationPrefill(), applyMovementPrefill(), applyRequestedByPrefill(), applyTargetPrefill(), backToHierarchyLevel() (+8 more)

### Community 46 - "Hierarchy Edit State"
Cohesion: 0.20
Nodes (14): addAiCatalogAttr(), clearAiCatalogImage(), closeDialog(), emit, emptyAiCatalog(), onAiCatalogAttrKeydown(), openAiCatalogFound(), saveAiCatalog() (+6 more)

### Community 47 - "LoginModal.vue"
Cohesion: 0.32
Nodes (7): emit, errorMsg, { login }, onCancel(), onSubmit(), pass, user

### Community 48 - "Environment and Restore"
Cohesion: 0.31
Nodes (8): argValue(), loadEnvFile(), resolveEnvPath(), assertHealthyDatabase(), assertRestoreAllowed(), main(), restoreBackup(), timestamp()

### Community 49 - "Material Rule Logic"
Cohesion: 0.23
Nodes (13): itemForVariation(), itemMatchesRule(), materialCountForDestination(), materialLabel(), materialMeta(), removeMaterialRule(), ruleKey(), setRuleVariationLinks() (+5 more)

### Community 50 - "History Filter Sidebar"
Cohesion: 0.17
Nodes (10): detailFacets, detailSelectedCount, expandedGroups, expandedSections, isExpanded(), mainFacets, productFacets, props (+2 more)

### Community 51 - "Order Formatting Utilities"
Cohesion: 0.23
Nodes (13): formatDate(), formatDateOnly(), formatDateTimeParts(), formatTimeOnly(), maintenanceEndLabel(), maintenanceLocationLabel(), maintenancePeriod(), motorOrderTitle() (+5 more)

### Community 52 - "resetOsForm"
Cohesion: 0.18
Nodes (14): applyMotorToOsForm(), applyScopedMotorToOsForm(), cancelEdit(), cancelNewOsForm(), closeOrderDetails(), closeQuickSuggestions(), emit, handleQuickSuggestionDocumentKeydown() (+6 more)

### Community 53 - "Global Keyboard Shortcuts"
Cohesion: 0.27
Nodes (11): clearShortcutPrefix(), closeGlobalSearch(), closeShortcutHelp(), closeTopPopup(), handleGlobalShortcutKeydown(), isEditableTarget(), openGlobalCreate(), openGlobalSearch() (+3 more)

### Community 54 - "Motor Work Order Flow"
Cohesion: 0.20
Nodes (11): cancelMotorForm(), createWorkOrderForMotor(), emptyMotorForm(), openMotorWorkOrdersPage(), registerWorkOrderForMotor(), saveMotor(), selectMotor(), setMotorViewMode() (+3 more)

### Community 55 - "confirmCurrentMovement"
Cohesion: 0.20
Nodes (12): commonMovementFields(), confirmCurrentMovement(), confirmQuickEntryQueue(), confirmQuickExitQueue(), currentMovementLine(), emit, ensureSuppliersForLines(), notifyStockAlert() (+4 more)

### Community 56 - "EpiSheetDialog.vue"
Cohesion: 0.04
Nodes (45): { activeDestinations }, { activeRoleRules }, addDraftRow(), allEpiCatalogRows, blankRows, canRegister, deliveryDate, draftRows (+37 more)

### Community 57 - "Seed Data Generation"
Cohesion: 0.33
Nodes (7): enrichSeedData(), findSeedRow(), generateSeedData(), makeItems(), makeMovement(), generateId(), loadSeedData()

### Community 58 - "useTheme.js"
Cohesion: 0.30
Nodes (8): listThemes(), themesFromNames(), applyStoredTheme(), canUseLocalVisualStyles(), loadVisualStyle(), safeStyle(), storedIsDark(), useTheme()

### Community 59 - "Toast Notifications"
Cohesion: 0.31
Nodes (5): { toasts }, toasts, toastTimers, useToast(), units

### Community 60 - "Variation Form Logic"
Cohesion: 0.31
Nodes (8): saveEdit(), emptyVariationForm(), extrasListToObject(), validateVariationForm(), variationFormForItem(), variationSetupIssues(), saveVariation(), startAddVariation()

### Community 61 - "Destination Data Mapping"
Cohesion: 0.32
Nodes (5): clean(), normalizeRules(), parseRules(), router, toDestination()

### Community 62 - "all.js"
Cohesion: 0.39
Nodes (7): children, interactive, kill(), restart(), start(), stop(), targets

### Community 63 - "AI Suggestion Schema"
Cohesion: 0.46
Nodes (6): analyzeCatalogImage(), normalizeCatalogSuggestion(), singularTaxonomyKey(), suggestionSchema, taxonomyKey(), UNITS

### Community 64 - "failedSourceNames"
Cohesion: 0.40
Nodes (4): closePasswordModal(), loadAllData(), submitOwnPassword(), failedSourceNames()

### Community 65 - "Hierarchy Selector Path"
Cohesion: 0.36
Nodes (8): makeCategoryTarget(), makeGroupTarget(), makeSubcategoryTarget(), resetSelectorPath(), selectCategory(), selectGroup(), selectSubcategory(), setModalTarget()

### Community 66 - "Hierarchy Edit Dialog"
Cohesion: 0.29
Nodes (5): dialogRef, emit, props, requestClose(), {
  units,
  uniqueGroups,
  getCategoriesForGroup,
  getSubcategoriesForCategory,
  countItemsInGroup,
  countItemsInCategory,
  getItemsForSubcategory,
  getVariationsForItem,
  getItemExtraKeys,
  selectedGroup,
  selectedCategory,
  selectedSubcategory,
  groupSearch,
  searchQ,
  filteredGroupList,
  editing,
  editValue,
  startEdit,
  cancelEdit,
  saveEdit,
  onEditKeydown,
  isEditing,
  requestDelete,
  isDeleting,
  cancelDelete,
  confirmDelete,
  moving,
  moveTargetGroup,
  moveTargetCategory,
  moveTargetSubcategory,
  moveTargetCategories,
  moveTargetSubcategories,
  startMoveCategory,
  startMoveSubcategory,
  startMoveItem,
  cancelMove,
  saveMove,
  editingAttr,
  editAttrValue,
  addingAttrItemId,
  newAttrName,
  startAttrEdit,
  saveAttrEdit,
  cancelAttrEdit,
  onAttrEditKeydown,
  startAddAttr,
  saveNewAttr,
  cancelAddAttr,
  onNewAttrKeydown,
  onRemoveAttr,
  editingUnitItemId,
  editUnitValue,
  startEditUnit,
  saveEditUnit,
  cancelEditUnit,
  isEditingAttr,
  groupDirectItems,
  categoryDirectItems,
  getGroupModelAttrs,
  getCategoryModelAttrs,
  getVisibleItemsForSubcategory,
  countVisibleItemsInSubcategory,
  groupDirectKey,
  categoryDirectKey,
  addingItemForSub,
  newItemName,
  newItemUnit,
  newItemAttrs,
  newItemAttrInput,
  newItemContextLabel,
  newItemHelpText,
  newItemPlaceholder,
  startAddItem,
  cancelAddItem,
  addNewItemAttr,
  onNewItemAttrKeydown,
  saveAddItem,
  onNewItemKeydown,
  expandedItemId,
  toggleItemExpand,
  addingVariationForItemId,
  newVariationValues,
  newVariationStock,
  startAddVariation,
  cancelAddVariation,
  saveAddVariation,
  editingVariationId,
  editingVariationValues,
  editingVariationStock,
  startEditVariation,
  cancelEditVariation,
  saveEditVariation,
  onDeleteVariation,
  groupCategories,
  filteredCategoryList,
  categorySubcategories,
  filteredSubcategoryList,
  aiCatalogOpen,
  aiCatalogImage,
  aiCatalogLoading,
  aiCatalogError,
  aiCatalogAttrInput,
  aiCatalog,
  aiCatalogValueAttrs,
  aiCatalogReady,
  startAiCatalog,
  cancelAiCatalog,
  clearAiCatalogImage,
  onAiCatalogImageSelected,
  addAiCatalogAttr,
  onAiCatalogAttrKeydown,
  saveAiCatalog,
  addingGroup,
  newGroupName,
  startAddGroup,
  cancelAddGroup,
  saveAddGroup,
  onAddGroupKeydown,
  addingCategory,
  newCategoryName,
  startAddCategory,
  cancelAddCategory,
  saveAddCategory,
  onAddCategoryKeydown,
  addingSubcategory,
  newSubcategoryName,
  newSubcategoryUnit,
  newSubcategoryAttrs,
  newSubcategoryAttrInput,
  addNewSubcategoryAttr,
  onNewSubcategoryAttrKeydown,
  startAddSubcategory,
  cancelAddSubcategory,
  saveAddSubcategory,
  onAddSubcategoryKeydown,
  dragCtx,
  dragToIdx,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDraggingType,
  isDragFrom,
  isDragTarget,
  organizeGroupsAlphabetically,
  organizeCategoriesAlphabetically,
  organizeSubcategoriesAlphabetically,
}

### Community 67 - "EPI Data Hooks"
Cohesion: 0.32
Nodes (6): collator, periodicities, roleRules, sortPeriods(), sortRules(), useEpis()

### Community 68 - "motorEventLabel"
Cohesion: 0.13
Nodes (19): motorEventLabel(), motorOpenEventLabel(), workOrderMotorEventLabel(), applyMotorEventToOrder(), buildMotorEventPayload(), buildOrderTitle(), buildOsPayload(), cancelMotorEvent() (+11 more)

### Community 69 - "Image Processing Utilities"
Cohesion: 0.43
Nodes (6): onAiCatalogImageSelected(), addVariationPhoto(), canvasToJpeg(), compressImageFile(), fileAsDataUrl(), imageFromBlob()

### Community 70 - "Document Field Component"
Cohesion: 0.33
Nodes (6): changeType(), emit, number, prefix, props, selectedType

### Community 71 - "Destination Summary Hooks"
Cohesion: 0.48
Nodes (5): collator, compareMaterial(), compareText(), movementVariationLabel(), useDestinationSummary()

### Community 72 - "formatDate"
Cohesion: 0.33
Nodes (6): csvCell(), exportSelectedMotorEventsCsv(), formatDate(), formatLocationPeriod(), workOrderDateLabel(), workOrderEndLabel()

### Community 73 - "General CSV Export"
Cohesion: 0.29
Nodes (7): csvCell(), csvDateStamp(), downloadCsv(), exportAllHistoryCsv(), exportFilteredHistoryCsv(), exportOrdersCsv(), exportSingleOrderCsv()

### Community 74 - "navigateTab"
Cohesion: 0.25
Nodes (9): canAccessTarget(), handleGlobalSearchKeydown(), handleMovementComplete(), navigateTab(), openContextQuickMovement(), openGlobalSearchResult(), openMovementTab(), runCreateAction() (+1 more)

### Community 75 - "AppButton.vue"
Cohesion: 0.18
Nodes (7): props, sizeClasses, variantClasses, accountOpen, emit, root, run()

### Community 76 - "MotorPicker.vue"
Cohesion: 0.19
Nodes (10): emit, filteredOptions, handleInput(), open, openPicker(), props, rootEl, search (+2 more)

### Community 77 - "Status Badge Component"
Cohesion: 0.33
Nodes (5): props, resolvedLabel, sizeClasses, tone, toneClasses

### Community 78 - "Closing Data Hooks"
Cohesion: 0.33
Nodes (5): closingDetails, closings, useClosings(), createClosing(), deleteClosing()

### Community 79 - "Direct Variation Setup"
Cohesion: 0.40
Nodes (6): onDirectVariationCategoryChange(), onDirectVariationGroupChange(), onDirectVariationSubcategoryChange(), resetDirectVariationForm(), startDirectVariation(), syncDirectVariationSingleModel()

### Community 80 - "epiSheet.js"
Cohesion: 0.29
Nodes (10): key(), attributeValue(), buildCatalogEpiSheetRow(), buildEpiKitRows(), buildEpiSheetRows(), CA_KEYS, catalogRowsForTarget(), DESCRIPTION_KEYS (+2 more)

### Community 81 - "Material Search Logic"
Cohesion: 0.50
Nodes (5): availableVariationsForItem(), itemHasAvailableVariation(), itemMatchesMaterialSearch(), materialMatchesSearch(), variationLabel()

### Community 82 - "Material Navigation State"
Cohesion: 0.40
Nodes (5): cancelMaterialAdd(), goMaterialRoot(), resetMaterialNavigation(), savePendingMaterials(), startMaterialAdd()

### Community 83 - "CatalogPendingTab.vue"
Cohesion: 0.10
Nodes (16): collator, currentPage, filteredRows, issueLabels, itemById, { items, variations }, pageSize, paginatedRows (+8 more)

### Community 84 - "Location Data Hooks"
Cohesion: 0.50
Nodes (4): collator, locais, sortByName(), useLocations()

### Community 85 - "Work Order Hooks"
Cohesion: 0.40
Nodes (4): report, useWorkOrders(), workOrderEvents, workOrders

### Community 86 - "parsePeopleCsv"
Cohesion: 0.36
Nodes (6): createMissingRoles(), importPeopleCsv(), normalizeSearch(), normalizeHeader(), parseCsvLine(), parsePeopleCsv()

### Community 87 - "Stock Adjustment Logic"
Cohesion: 0.40
Nodes (5): adjustSheetStock(), applyStockAdjustment(), cancelAdjust(), confirmAdjust(), onAdjustKeydown()

### Community 88 - "Hierarchy Search Selection"
Cohesion: 0.40
Nodes (5): findSingleHierarchySearchMatch(), handleItemSearchEnter(), selectItem(), selectVariation(), selectVariationResult()

### Community 89 - "useMovementHistory.js"
Cohesion: 0.43
Nodes (6): FIELD_BY_FILTER, loadHistoryState(), PAGE_SIZE_OPTIONS, savedFilters(), saveHistoryState(), useMovementHistory()

### Community 92 - "Q: Por que useToast e useItems conectam tantas comunidades?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Por que useToast e useItems conectam tantas comunidades?, Source Nodes

### Community 94 - "Material Step Navigation"
Cohesion: 0.50
Nodes (4): focusRef(), matBackToStep1(), selectMatVariation(), startAddMaterial()

### Community 95 - "Q: As conexões inferidas com key() são reais?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: As conexões inferidas com key() são reais?, Source Nodes

### Community 99 - "useAuth.js"
Cohesion: 0.22
Nodes (8): useAuth(), user, apiError(), clearAuthData(), login(), logout(), requestBlob(), setAuthData()

### Community 100 - "Dropdown Positioning Styles"
Cohesion: 0.67
Nodes (3): openDestsDrop(), openLocalDrop(), _rectStyle()

### Community 101 - "Quick Movement Actions"
Cohesion: 0.67
Nodes (3): emit, quickMovement(), quickSheetMovement()

### Community 102 - "Movement Metadata Display"
Cohesion: 0.67
Nodes (3): movementPlace(), movementResponsible(), movementTimelineSubtitle()

### Community 103 - "Movement Work Order Links"
Cohesion: 0.67
Nodes (3): movementTimelineTitle(), workOrderFromMovement(), workOrderNumberFromMovement()

### Community 104 - "Material Variation Options"
Cohesion: 0.67
Nodes (3): materialOptionLabel(), materialOptionPath(), variationLabel()

### Community 105 - "Motor Material Selection"
Cohesion: 0.67
Nodes (3): resetMotorMaterialPath(), selectMotorMaterialCategory(), selectMotorMaterialGroup()

### Community 106 - "Supplier Selection Logic"
Cohesion: 0.67
Nodes (3): closeSupplierDropdown(), handleSupplierKeydown(), selectSupplier()

### Community 107 - "Movement Edit Helpers"
Cohesion: 0.67
Nodes (3): movementDestinationIdForName(), startEditMovement(), toLocalDatetimeStr()

### Community 113 - "Q: Os módulos de movimentações e ordens de serviço devem ser divididos?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Os módulos de movimentações e ordens de serviço devem ser divididos?, Source Nodes

### Community 114 - "Q: O que acha do grafo? está bom? está profissional? comercial? esse é o aspecto q o sistema passa?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: O que acha do grafo? está bom? está profissional? comercial? esse é o aspecto q o sistema passa?, Source Nodes

### Community 115 - "Q: Como eu posso explicar o grafo pra alguém?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Como eu posso explicar o grafo pra alguém?, Source Nodes

### Community 121 - "Q: Qual parte do shell causa o overflow e a navegação ruim no celular?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Qual parte do shell causa o overflow e a navegação ruim no celular?, Source Nodes

### Community 132 - "normalizeSearchText"
Cohesion: 0.29
Nodes (12): motorMatchesIdentity(), buildGlobalSearchResults(), filterDestinations(), findExactDestination(), matches(), matchesSearchTokens(), normalizeSearchText(), searchTokens() (+4 more)

### Community 138 - "Q: consegue arrumar pra celular?, principalmente onde você ache que mais vai ter fluxo de aparelho móvel utilizando"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: consegue arrumar pra celular?, principalmente onde você ache que mais vai ter fluxo de aparelho móvel utilizando, Source Nodes

### Community 139 - "Q: ta vazando no celular"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: ta vazando no celular, Source Nodes

### Community 141 - "rowsToCsv"
Cohesion: 0.20
Nodes (10): buildClosingData(), monthWindow(), closingStatus(), csvCell(), destinationsText(), extrasText(), handleExportDetails(), rowsToCsv() (+2 more)

### Community 142 - "duplicateSignatureFromOrder"
Cohesion: 0.67
Nodes (4): duplicateSignatureFromOrder(), duplicateSignatureFromPayload(), duplicateValue(), shouldWarnDuplicateWorkOrder()

### Community 143 - "selectDestination"
Cohesion: 0.29
Nodes (8): focus(), fullName(), handleEnter(), isGroupOpen(), isSelected(), selectDestination(), selectedParentId(), selectionValue()

### Community 144 - "isOrderFinished"
Cohesion: 0.29
Nodes (8): editFocusedOrder(), isOrderFinished(), isOrderOpen(), openOrderFromHistory(), orderStatusClass(), orderStatusLabel(), revealOrder(), startEditOS()

### Community 145 - "people.js"
Cohesion: 0.47
Nodes (5): clean(), normalizeStatus(), PERSON_STATUSES, presentPerson(), router

### Community 146 - "AppModal.vue"
Cohesion: 0.50
Nodes (4): emit, inputValue, props, requestClose()

### Community 147 - "useRoles.js"
Cohesion: 0.50
Nodes (4): collator, roles, sortByName(), useRoles()

### Community 148 - "closeMobileSidebar"
Cohesion: 0.50
Nodes (4): closeCatalogSidebar(), closeMobileSidebar(), openMobileSidebar(), toggleSidebar()

### Community 149 - "makeItemTarget"
Cohesion: 0.67
Nodes (3): hierarchy(), makeItemTarget(), selectItem()

## Knowledge Gaps
- **1186 isolated node(s):** `name`, `private`, `version`, `type`, `server` (+1181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Work-memory lessons

**Preferred sources** — corroborated by past sessions; start here.
- `OrdensServicoView.vue` (4× useful, score=3.99309061) _(code changed — re-verify)_
- `PhotoMovementTab.vue` (3× useful, score=2.995453952) _(code changed — re-verify)_
- `CatalogView.vue` (3× useful, score=2.995453952) _(code changed — re-verify)_
- `MovimentacoesView.vue` (3× useful, score=2.993395243) _(code changed — re-verify)_
- `useItems()` (3× useful, score=2.993394778)
- `App.vue` (2× useful, score=1.999071607) _(code changed — re-verify)_
- `request()` (2× useful, score=1.995758586)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useToast()` connect `Toast Notifications` to `MovimentacoesView.vue`, `Service Order Management`, `MotoresView.vue`, `InventarioView.vue`, `App.vue`, `DestinationsTab.vue`, `Catalog and Categories View`, `PhotoMovementTab.vue`, `EpisTab.vue`, `PeopleTab.vue`, `Item Variation Sheet`, `Supplier Management`, `FechamentosView.vue`, `User Access Control`, `Role Management`, `AI Catalog Assistant`, `Location Management`, `Hierarchy Edit State`, `EpiSheetDialog.vue`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `useItems()` connect `useItems.js` to `MovimentacoesView.vue`, `Service Order Management`, `MotoresView.vue`, `InventarioView.vue`, `App.vue`, `api.js`, `DestinationsTab.vue`, `Catalog and Categories View`, `PhotoMovementTab.vue`, `EpisTab.vue`, `Item Variation Sheet`, `DashboardView.vue`, `EpiControlTab.vue`, `AI Catalog Assistant`, `Hierarchy Edit State`, `EpiSheetDialog.vue`, `Toast Notifications`, `epiSheet.js`, `CatalogPendingTab.vue`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `normalizeSearchText()` connect `normalizeSearchText` to `MovimentacoesView.vue`, `Service Order Management`, `MotoresView.vue`, `InventarioView.vue`, `DestinationsTab.vue`, `EpisTab.vue`, `Supplier Management`, `duplicateSignatureFromOrder`, `DestinationTreePicker.vue`, `commitQuickAutocomplete`, `photoMovement.js`, `refactors.test.js`, `Person Picker Component`, `useMotors.js`, `pad`, `Inventory Export Utilities`, `focusRef`, `Order Formatting Utilities`, `EpiSheetDialog.vue`, `MotorPicker.vue`, `epiSheet.js`, `Hierarchy Search Selection`, `useMovementHistory.js`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `useItems()` (e.g. with `key()` and `_findDuplicateItem()`) actually correct?**
  _`useItems()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _1186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MovimentacoesView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.012658227848101266 - nodes in this community are weakly interconnected._
- **Should `Service Order Management` be split into smaller, more focused modules?**
  _Cohesion score 0.01397819401733296 - nodes in this community are weakly interconnected._