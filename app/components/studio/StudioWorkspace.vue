<template>
  <div class="studio-workspace">
    <div class="creation-content">
      <div class="studio-workspace__grid">
        <section class="studio-workspace__input" aria-label="创作设置">
          <slot name="composer" />
        </section>
        <section class="studio-workspace__output" aria-label="创作结果">
          <slot />
        </section>
      </div>
    </div>
    <slot name="dialogs" />
  </div>
</template>
