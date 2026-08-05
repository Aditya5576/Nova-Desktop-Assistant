const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 32x32 Purple Icon Base64 PNG
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAADh0RVh0U29mdHdhcmUAR3JhcGhpY2tNYWdpY2sgMS4zLjM1IDIwMjAtMDItMjMgUTE2IGh0dHA6Ly93d3cuZ3JhcGhpY2ttYWdpY2sub3JnL269uUAAAAN6VFh0TWV0YWRhdGEAAHicY2AYBYMFIGwG1m0MDAwAQKcAEnw/kZ8AAAAASUVORK5CYII=';

const iconPath = path.join(assetsDir, 'icon.png');
fs.writeFileSync(iconPath, Buffer.from(base64Png, 'base64'));
console.log('Created icon.png successfully at:', iconPath);
