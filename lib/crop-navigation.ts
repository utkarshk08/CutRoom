export type MobileTool = 'pieces' | 'wall' | 'assistant' | 'inspect';

export type MobileCropNavigation = {
  activeTool: 'wall';
  returnTool: MobileTool;
};

/**
 * Cropping is performed on the wall canvas, but remembers whichever mobile
 * tool launched it so both Done and Cancel can return the user there.
 */
export function beginMobileCrop(launchingTool: MobileTool): MobileCropNavigation {
  return {
    activeTool: 'wall',
    returnTool: launchingTool,
  };
}

export function endMobileCrop(navigation: Pick<MobileCropNavigation, 'returnTool'>): MobileTool {
  return navigation.returnTool;
}
