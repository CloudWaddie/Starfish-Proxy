// Advanced Anticheat System
// Adapted from Pug's Custom Anticheat Raven script (github.com/PugrillaDev)
// Extra checks implemented by CloudWaddie from https://github.com/Nova-Committee/CheatDetector

module.exports = (api) => {
    api.metadata({
        name: 'anticheat',
        displayName: 'Cheater Detector',
        prefix: '§cAC',
        version: '1.2.1',
        author: 'Hexze and CloudWaddie',
        description: 'Advanced cheater detector system (Inspired by github.com/PugrillaDev)',
        optionalDependencies: ['urchin']
    });

    const anticheat = new AnticheatSystem(api);
    anticheat.startGracePeriod();
    
    const configSchema = [];
    const checkDefinitions = getCheckDefinitions();
    
    for (const checkName in checkDefinitions) {
        const defaultCheckConfig = checkDefinitions[checkName];
            
        configSchema.push({
            label: checkName,
            defaults: { checks: { [checkName]: defaultCheckConfig } },
            settings: [
                {
                    type: 'toggle',
                    key: `checks.${checkName}.enabled`,
                    text: ['OFF', 'ON'],
                    description: defaultCheckConfig.description || `Enables or disables the ${checkName} check.`
                },
                {
                    type: 'toggle',
                    key: `checks.${checkName}.autoWdr`,
                    text: ['OFF', 'ON'],
                    description: `Automatically reports the player for ${checkName}.`
                },
                {
                    type: 'toggle',
                    key: `checks.${checkName}.runCheckOnSelf`,
                    text: ['OFF', 'ON'],
                    description: `Runs this check on your own player.`,
                    condition: (cfg) => cfg.checks[checkName].enabled && (checkName === 'HungerSprint'),
                },
                {
                    type: 'soundToggle',
                    key: `checks.${checkName}.sound`,
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Toggles sound alerts for this check.'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.vl`,
                    values: [
                        { text: 'VL: 5', value: 5 },
                        { text: 'VL: 10', value: 10 },
                        { text: 'VL: 15', value: 15 },
                        { text: 'VL: 20', value: 20 },
                        { text: 'VL: 30', value: 30 }
                    ],
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Sets the violation level to trigger an alert.'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.cooldown`,
                    values: [
                        { text: 'CD: 0s', value: 0 },
                        { text: 'CD: 1s', value: 1000 },
                        { text: 'CD: 2s', value: 2000 },
                        { text: 'CD: 3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Sets the cooldown between alerts for this check.'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.alertBuffer`,
                    values: [
                        { text: 'Buffer: 1', value: 1 },
                        { text: 'Buffer: 2', value: 2 },
                        { text: 'Buffer: 5', value: 5 },
                        { text: 'Buffer: 10', value: 10 },
                        { text: 'Buffer: 20', value: 20 },
                        { text: 'Buffer: 30', value: 30 }
                    ],
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Sets the number of violations required to trigger subsequent alerts.'
                }
            ]
        });
    }

    api.initializeConfig(configSchema);
    api.configSchema([
        {
            label: 'Global Rate Limiting',
            defaults: { globalRateLimit: { enabled: true, maxAlerts: 20, timeWindow: 300000 } },
            settings: [
                {
                    type: 'toggle',
                    key: 'globalRateLimit.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enables a global limit on the number of alerts per player to reduce spam.'
                },
                {
                    type: 'cycle',
                    key: 'globalRateLimit.maxAlerts',
                    values: [
                        { text: '10 Alerts', value: 10 },
                        { text: '20 Alerts', value: 20 },
                        { text: '30 Alerts', value: 30 },
                        { text: '50 Alerts', value: 50 }
                    ],
                    condition: (cfg) => cfg.globalRateLimit.enabled,
                    description: 'The maximum number of alerts a player can trigger within the time window.'
                },
                {
                    type: 'cycle',
                    key: 'globalRateLimit.timeWindow',
                    values: [
                        { text: '1 Minute', value: 60000 },
                        { text: '5 Minutes', value: 300000 },
                        { text: '10 Minutes', value: 600000 },
                        { text: '30 Minutes', value: 1800000 }
                    ],
                    condition: (cfg) => cfg.globalRateLimit.enabled,
                    description: 'The time window for the global alert limit.'
                }
            ]
        },
        {
            label: 'Tab List Display',
            defaults: { tabListDisplay: { enabled: true } },
            settings: [
                {
                    type: 'toggle',
                    key: 'tabListDisplay.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Shows player alert counts in the tab list.'
                }
            ]
        },
        ...configSchema
    ]);
    
    anticheat.registerHandlers();
    anticheat.registerCommands();

    api.on('config_change', (event) => {
        if (event.plugin === 'anticheat') {
            anticheat.refreshConfigConstants();
        }
    });

    return {
        enable: () => {
            anticheat.refreshConfigConstants();
            api.debugLog('[AC] Anticheat plugin enabled with debug logging');
        },
        disable: () => {
            anticheat.cleanup();
            api.debugLog('[AC] Anticheat plugin disabled');
        }
    };
};

const flyCMinRepeatTicks = 10;

const CHECKS = {
    FlyA: {
        config: {
            enabled: false, sound: true, vl: 2, cooldown: 1000, autoWdr: false,
            description: "Detects vertical motion stopping mid-air."
        },
        check: function(player, config) {
            if (!player.onGround && !player.isInWater && !player.isElytraFlying) {
                if (player.velocity.y === 0) {
                    player.flyA.zeroVelocityTicks++;
                } else {
                    player.flyA.zeroVelocityTicks = 0;
                }

                if (player.flyA.zeroVelocityTicks >= 2) {
                    this.addViolation(player, 'FlyA', 1);
                    if (this.shouldAlert(player, 'FlyA', config)) {
                        this.flag(player, 'FlyA', player.violations.FlyA);
                        this.markAlert(player, 'FlyA');
                    }
                }
            } else {
                player.flyA.zeroVelocityTicks = 0;
                this.reduceViolation(player, 'FlyA', 1);
            }
        }
    },

    FlyB: {
        config: {
            enabled: false, sound: true, vl: 1, cooldown: 1000, autoWdr: false,
            description: "Detects swimming while not in water."
        },
        check: function(player, config) {
            if (player.isSwimming && !player.isInWater) {
                this.addViolation(player, 'FlyB', 1);
                if (this.shouldAlert(player, 'FlyB', config)) {
                    this.flag(player, 'FlyB', player.violations.FlyB);
                    this.markAlert(player, 'FlyB');
                }
            }
        }
    },

    FlyC: {
        config: {
            enabled: false, sound: true, vl: 10, cooldown: 2000, autoWdr: false,
            description: "Detects constant vertical movement speed mid-air."
        },
        check: function(player, config) {
            if (!player.onGround && !player.isInWater) {
                if (player.velocity.y === player.flyC.lastVelocityY) {
                    player.flyC.repeatTicks++;
                } else {
                    player.flyC.repeatTicks = 0;
                }
                player.flyC.lastVelocityY = player.velocity.y;

                if (player.flyC.repeatTicks >= flyCMinRepeatTicks) {
                    this.addViolation(player, 'FlyC', 1);
                    if (this.shouldAlert(player, 'FlyC', config)) {
                        this.flag(player, 'FlyC', player.violations.FlyC);
                        this.markAlert(player, 'FlyC');
                    }
                }
            } else {
                player.flyC.repeatTicks = 0;
            }
        }
    },

    NoSlowA: {
        config: {
            enabled: true, sound: true, vl: 20, cooldown: 2000, autoWdr: false,
            description: "Detects moving too fast while using items that should slow you down."
        },
        check: function(player, config) {
            // If a jump has occurred in the last 750ms, skip this check entirely.
            if (Date.now() - player.lastJumpTime < 750) {
                return;
            }

            if (!player.onGround) {
                player.itemUseTick = 0;
                return;
            }

            const SLOW_SPEED = [2.56, 1.92, 1.6, 1.4, 1.36, 1.26, 1.18, 1.16];
            const threshold = 1.0;

            if (player.isUsingItem && player.lastUsing) {
                player.itemUseTick = Math.min(7, player.itemUseTick + 1);
            } else {
                player.itemUseTick = 0;
            }

            if (player.itemUseTick > 0) {
                const deltaX = player.position.x - player.lastPosition.x;
                const deltaZ = player.position.z - player.lastPosition.z;
                const secSpeed = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ) * 20; // blocks per second

                const speedMul = 1.0 + (player.speedLevel * 0.2);
                const possibleSpeed = SLOW_SPEED[player.itemUseTick] * speedMul + threshold;

                if (secSpeed > possibleSpeed) {
                    this.addViolation(player, 'NoSlowA', 1);
                    if (this.shouldAlert(player, 'NoSlowA', config)) {
                        this.flag(player, 'NoSlowA', player.violations.NoSlowA);
                        this.markAlert(player, 'NoSlowA');
                    }
                }
            } else {
                this.reduceViolation(player, 'NoSlowA');
            }
        }
    },
    
    AutoBlockA: {
        config: {
            enabled: true, sound: true, vl: 20, cooldown: 2000, autoWdr: false,
            description: "Detects attacking while blocking with a sword."
        },
        check: function(player, config) {
            // This check is handled in performAttackChecks
        }
    },
    
    EagleA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, autoWdr: false,
            description: "Detects diagonal double-shifting eagle (legit scaffold) patterns." 
        },

        check: function(player, config) {
            const isLookingDown = player.pitch >= 30;
            const isOnGround = player.onGround;
            const isSwingingBlock = player.swingProgress > 0 && player.isHoldingBlock();
            
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            const isMovingFast = horizontalSpeed > 2.0;
            
            let movementAngle = Math.atan2(player.velocity.z, player.velocity.x) * 180 / Math.PI;
            if (movementAngle < 0) movementAngle += 360;
            const cardinalAngles = [0, 90, 180, 270];
            const isMovingStraight = cardinalAngles.some(angle => 
                Math.abs(movementAngle - angle) <= 15 || Math.abs(movementAngle - angle - 360) <= 15
            );
            const isMovingDiagonal = !isMovingStraight && horizontalSpeed > 0.1;
            
            const currentTime = Date.now();
            const recentShifts = player.shiftEvents.filter(event =>
                currentTime - event.timestamp < 2000 && event.type === 'start'
            );
            const shiftCount = recentShifts.length;
            const hasExcessiveShifts = shiftCount > 6 && horizontalSpeed > 2.5;
            
            const isEagle = isLookingDown && isOnGround && isSwingingBlock && 
                           isMovingDiagonal && isMovingFast && hasExcessiveShifts;

            if (isEagle) {
                this.addViolation(player, 'EagleA', 3);
                
                if (this.shouldAlert(player, 'EagleA', config)) {
                    this.flag(player, 'EagleA', player.violations.EagleA);
                    this.markAlert(player, 'EagleA');
                }
            } else {
                this.reduceViolation(player, 'EagleA', 3);
            }
        }
    },
    
    FastBridgeA: {
        config: {
            enabled: true, sound: true, vl: 25, cooldown: 2000, autoWdr: false,
            description: "Detects fast flat scaffold with no vertical movement (formerly ScaffoldA)."
        },
        check: function(player, config) {
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            
            const isLikelyDead = player.position.y > 100;
            if (isLikelyDead) {
                this.reduceViolation(player, 'FastBridgeA');
                return;
            }
            
            const isLookingDown = player.pitch >= 25;
            const isPlacingBlocks = player.swingProgress > 0 && player.isHoldingBlock();
            const isMovingFast = horizontalSpeed > 5.0;
            const isNotSneaking = !player.isCrouching;
            const isFlat = Math.abs(player.velocity.y) < 0.1;
            
            const isScaffold = isLookingDown && isPlacingBlocks && isMovingFast && isNotSneaking && isFlat;
            
            if (isScaffold) {
                this.addViolation(player, 'FastBridgeA', 1);
                
                if (this.shouldAlert(player, 'FastBridgeA', config)) {
                    this.flag(player, 'FastBridgeA', player.violations.FastBridgeA);
                    this.markAlert(player, 'FastBridgeA');
                }
            } else {
                this.reduceViolation(player, 'FastBridgeA');
            }
        }
    },

    ScaffoldA: {
        config: {
            enabled: true, sound: true, vl: 10, cooldown: 1000, autoWdr: false,
            description: "Detects placing blocks without a corresponding swing animation."
        },
        check: function(player, config) {
            // This check is now handled directly in handleBlockPlace
        }
    },
    
    
    TowerA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, autoWdr: false,
            description: "Detects ascending (towering) faster than normal while placing blocks below." 
        },
        
        check: function(player, config) {
            const currentTime = Date.now();
            const verticalSpeed = player.velocity.y;
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            
            const isLookingDown = player.pitch >= 30;
            const isSwingingBlock = player.swingProgress > 0 && player.isHoldingBlock();
            const hasNoJumpBoost = !player.hasJumpBoost;
            const isAscendingFast = verticalSpeed > 5.5;
            
            const verticalToHorizontalRatio = horizontalSpeed > 0 ? verticalSpeed / horizontalSpeed : verticalSpeed;
            const hasProperTowerRatio = verticalToHorizontalRatio >= 0.8;
            
            const hasRecentDamage = player.lastDamaged > 0 && (currentTime - player.lastDamaged) < 500;
            
            if (!player.towerData) {
                player.towerData = {
                    heightHistory: [],
                    lastReset: currentTime
                };
            }
            
            if (currentTime - player.towerData.lastReset > 2000) {
                player.towerData.heightHistory = [];
                player.towerData.lastReset = currentTime;
            }
            
            if (isLookingDown && isSwingingBlock && isAscendingFast && hasProperTowerRatio && hasNoJumpBoost && !hasRecentDamage) {
                player.towerData.heightHistory.push({
                    y: player.position.y,
                    time: currentTime
                });
                
                if (player.towerData.heightHistory.length > 15) {
                    player.towerData.heightHistory.shift();
                }
            }
            
            if (player.towerData.heightHistory.length >= 8) {
                const heights = player.towerData.heightHistory;
                const start = heights[0];
                const end = heights[heights.length - 1];
                
                const totalHeightGain = end.y - start.y;
                const timeSpan = (end.time - start.time) / 1000;
                
                let consistentRiseCount = 0;
                for (let i = 1; i < heights.length; i++) {
                    if (heights[i].y > heights[i-1].y) {
                        consistentRiseCount++;
                    }
                }
                
                const consistencyRatio = consistentRiseCount / (heights.length - 1);
                const hasConsistentRise = consistencyRatio >= 0.8;
                const hasSignificantHeight = totalHeightGain >= 3.0;
                const hasGoodTimespan = timeSpan >= 0.4 && timeSpan <= 1.5;
                
                this.api.debugLog(`[TowerA] ${player.displayName} - VSpeed: ${verticalSpeed.toFixed(2)}, HSpeed: ${horizontalSpeed.toFixed(2)}, Ratio: ${verticalToHorizontalRatio.toFixed(2)}, HeightGain: ${totalHeightGain.toFixed(2)}, TimeSpan: ${timeSpan.toFixed(2)}s, ConsistentRise: ${consistentRiseCount}/${heights.length-1} (${consistencyRatio.toFixed(2)}), Consistent: ${hasConsistentRise}, SignificantHeight: ${hasSignificantHeight}, GoodTimespan: ${hasGoodTimespan}`);
                
                if (hasConsistentRise && hasSignificantHeight && hasGoodTimespan) {
                    this.addViolation(player, 'TowerA', 2);
                    
                    if (this.shouldAlert(player, 'TowerA', config)) {
                        this.flag(player, 'TowerA', player.violations.TowerA);
                        this.markAlert(player, 'TowerA');
                    }
                } else {
                    this.reduceViolation(player, 'TowerA');
                }
            }
        }
    },

    Blink: {
        config: {
            enabled: true, sound: true, vl: 7, cooldown: 1000, autoWdr: false,
            description: "Detects player teleporting by holding movement packets."
        },
        check: function(player, config) {
            const timeSinceTeleport = Date.now() - player.lastTeleportTime;
            if (player.gameMode === 3) { // 3 is Spectator Mode
                // Keep the teleport flag active as long as they are spectating.
                // This ensures the grace period starts fresh when they actually respawn/move out of spectator.
                player.lastTeleportTime = Date.now();
                return;
            }
            if (timeSinceTeleport < 3000) { // Bypass for 3 seconds after a teleport (Safer for large TPs/lag/respawn)
                return;
            }
            
            if (!player.lastPositionData) return;

            const deltaX = player.position.x - player.lastPosition.x;
            const deltaY = player.position.y - player.lastPosition.y;
            const deltaZ = player.position.z - player.lastPosition.z;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);

            const speedMul = 1.0 + (player.speedLevel * 0.2);
            const maxDistance = (8.0 * speedMul) + player.fallDistance + 1.0;

            if (distance > maxDistance) {
                this.addViolation(player, 'Blink', 1);
                if (this.shouldAlert(player, 'Blink', config)) {
                    this.flag(player, 'Blink', player.violations.Blink);
                    this.markAlert(player, 'Blink');
                }
            }
        }
    },


    HungerSprint: {
        config: {
            enabled: true, sound: true, vl: 7, cooldown: 1000, autoWdr: false,
            description: "Detects sprinting with low hunger."
        },
        check: function(player, config) {
            if (player.isSprinting && player.hunger <= 6) {
                this.addViolation(player, 'HungerSprint', 1);
                if (this.shouldAlert(player, 'HungerSprint', config)) {
                    this.flag(player, 'HungerSprint', player.violations.HungerSprint);
                    this.markAlert(player, 'HungerSprint');
                }
            }
        }
    },


    AimA: {
        config: {
            enabled: true, sound: true, vl: 10, cooldown: 1000, autoWdr: false,
            description: "Analyzes rotation for unnaturally smooth or precise movements."
        },
        check: function(player, config) {
            const MAX_DISTANCE = 6.0;
            const MIN_DIFF = 2.0;
            let closestTarget = null;
            let minDistance = MAX_DISTANCE;

            // Find the closest player within range
            for (const otherPlayer of this.playersByUuid.values()) {
                if (otherPlayer.uuid === player.uuid) continue;

                const dx = otherPlayer.position.x - player.position.x;
                const dy = otherPlayer.position.y - player.position.y;
                const dz = otherPlayer.position.z - player.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestTarget = otherPlayer;
                }
            }

            if (closestTarget) {
                const EYE_HEIGHT = 1.62;
                const dx = closestTarget.position.x - player.position.x;
                const dy = (closestTarget.position.y + EYE_HEIGHT) - (player.position.y + EYE_HEIGHT);
                const dz = closestTarget.position.z - player.position.z;
                const horizontalDist = Math.sqrt(dx * dx + dz * dz);

                let idealYaw = Math.atan2(dz, dx) * (180 / Math.PI) - 90;
                if (idealYaw < 0) idealYaw += 360;

                const idealPitch = -Math.atan2(dy, horizontalDist) * (180 / Math.PI);

                const yawDiff = Math.abs(player.yaw - idealYaw);
                const pitchDiff = Math.abs(player.pitch - idealPitch);

                if (yawDiff < MIN_DIFF && pitchDiff < MIN_DIFF) {
                    this.addViolation(player, 'AimA', 1);
                    if (this.shouldAlert(player, 'AimA', config)) {
                        this.flag(player, 'AimA', player.violations.AimA);
                        this.markAlert(player, 'AimA');
                    }
                }
            }
        }
    },

    AimB: {
        config: {
            enabled: true, sound: true, vl: 8, cooldown: 1000, autoWdr: false,
            description: "Identifies suspiciously perfect and instantaneous changes in viewing angle."
        },
        check: function(player, config) {
            const timeSinceTeleport = Date.now() - player.lastTeleportTime;
            if (timeSinceTeleport < 3000) { // Use 3000ms or higher for safety
                return;
            }

            if (player.lastYaw === null || player.lastPitch === null) return;

            const deltaYaw = Math.abs(player.yaw - player.lastYaw);
            const deltaPitch = Math.abs(player.pitch - player.lastPitch);

            const YAW_STEPS = [90, 135, 180];
            const PITCH_STEPS = [90, 135];
            const MIN_DIFF = 3.0; // Increased tolerance from 2.0 to 3.0

            let flagged = false;
            for (const step of YAW_STEPS) {
                if (Math.abs(deltaYaw - step) < MIN_DIFF) {
                    flagged = true;
                    break;
                }
            }
            if (!flagged) {
                for (const step of PITCH_STEPS) {
                    if (Math.abs(deltaPitch - step) < MIN_DIFF) {
                        flagged = true;
                        break;
                    }
                }
            }

            if (flagged) {
                this.addViolation(player, 'AimB', 1);
                if (this.shouldAlert(player, 'AimB', config)) {
                    this.flag(player, 'AimB', player.violations.AimB);
                    this.markAlert(player, 'AimB');
                }
            }
        }
    },

    InvalidPitch: {
        config: {
            enabled: true, sound: true, vl: 6, cooldown: 1000, autoWdr: false,
            description: "Flags players whose pitch (vertical viewing angle) exceeds the normal in-game limits."
        },
        check: function(player, config) {
            if (player.pitch > 90.0 || player.pitch < -90.0) {
                this.addViolation(player, 'InvalidPitch', 1);
                if (this.shouldAlert(player, 'InvalidPitch', config)) {
                    this.flag(player, 'InvalidPitch', player.violations.InvalidPitch);
                    this.markAlert(player, 'InvalidPitch');
                }
            }
        }
    },

    HitBoxA: {
        config: {
            enabled: true, sound: true, vl: 10, cooldown: 1000, autoWdr: false,
            description: "Detects enlarging hitboxes to hit players more easily."
        },
        check: function(player, config) {
            // This check is handled in handleEntityAnimation
        }
    },

    ReachA: {
        config: {
            enabled: true, sound: true, vl: 10, cooldown: 1000, autoWdr: false,
            description: "Detects attacking entities from an impossible distance."
        },
        check: function(player, config) {
            // This check is handled in handleEntityAnimation
        }
    },

    GameModeA: {
        config: {
            enabled: true, sound: true, vl: 6, cooldown: 1000, autoWdr: false, alertBuffer: 1,
            description: "Identifies players who illegitimately switch their game mode."
        },
        check: function(player, config) {
            // This check is handled in handlePlayerListUpdate
        }
    },

    StrafeA: {
        config: {
            enabled: true, sound: true, vl: 10, cooldown: 1000, autoWdr: false,
            description: "Detects players who are using a 'strafe' cheat to move in the air with perfect control."
        },
        check: function(player, config) {
            if (player.onGround || player.isInWater || player.isElytraFlying || player.jumpTick > 0) {
                return;
            }

            const motionX = player.velocity.x;
            const motionZ = player.velocity.z;
            const lastMotionX = player.strafeA.lastMotionX;
            const lastMotionZ = player.strafeA.lastMotionZ;

            if (lastMotionX === null || lastMotionZ === null) {
                return; // Not enough data
            }

            const speed = Math.sqrt(motionX * motionX + motionZ * motionZ);
            if (speed < 0.2) { // Don't check at very low speeds
                return;
            }

            // Predict motion based on yaw and air friction
            const friction = 0.91;
            const playerYaw = player.yaw * (Math.PI / 180);
            
            // This is a simplified prediction assuming forward/strafe input
            const moveForward = 0; // Assume no W/S for a pure strafe check
            const moveStrafe = speed / 0.98; // Estimate strafe input based on current speed

            let predictedMotionX = (lastMotionX * friction) + (moveStrafe * Math.cos(playerYaw - Math.PI / 2.0));
            let predictedMotionZ = (lastMotionZ * friction) + (moveStrafe * Math.sin(playerYaw - Math.PI / 2.0));
            
            // A more robust prediction would also account for forward movement
            // but this is a common pattern for simple strafe cheats.
            // Let's check the difference.
            const diffX = Math.abs(motionX - predictedMotionX);
            const diffZ = Math.abs(motionZ - predictedMotionZ);
            const totalDiff = diffX + diffZ;

            const MAX_DIFFERENCE = 0.005;
            if (totalDiff <= MAX_DIFFERENCE) {
                this.addViolation(player, 'StrafeA', 1);
                if (this.shouldAlert(player, 'StrafeA', config)) {
                    this.flag(player, 'StrafeA', player.violations.StrafeA);
                    this.markAlert(player, 'StrafeA');
                }
            }
        }
    },

    VelocityA: {
        config: {
            enabled: true, sound: true, vl: 7, cooldown: 1000, autoWdr: false, alertBuffer: 2,
            description: "Detects players illegitimately reducing or negating knockback."
        },
        check: function(player, config) {
            if (player.velocityA.fallDamageDisableTicks > 0) {
                player.velocityA.fallDamageDisableTicks--;
                return;
            }

            if (!this.shouldCheckVelocity(player)) {
                return;
            }

            if (player.hurtTime === 9) { // Hurt animation starts, 10 -> 9
                player.velocityA.isChecking = true;
                player.velocityA.checkTicks = 0;
                player.velocityA.noChangeTicks = 0;
                player.velocityA.lastHurtPos = { ...player.position };
            }

            if (player.velocityA.isChecking) {
                player.velocityA.checkTicks++;

                const posChanged = player.position.x !== player.velocityA.lastHurtPos.x ||
                                   player.position.y !== player.velocityA.lastHurtPos.y ||
                                   player.position.z !== player.velocityA.lastHurtPos.z;

                if (!posChanged) {
                    player.velocityA.noChangeTicks++;
                }

                const maxNoChangeTicks = Math.ceil(player.latency / 50) + 1; // Convert latency ms to ticks and add a buffer

                if (player.velocityA.noChangeTicks > maxNoChangeTicks) {
                    this.addViolation(player, 'VelocityA', 1);
                    if (this.shouldAlert(player, 'VelocityA', config)) {
                        this.flag(player, 'VelocityA', player.violations.VelocityA);
                        this.markAlert(player, 'VelocityA');
                    }
                    player.velocityA.isChecking = false; // Stop checking for this instance
                }

                // Stop checking after a reasonable time if they did move
                if (player.velocityA.checkTicks > 10) {
                    player.velocityA.isChecking = false;
                }
            }
        }
    }
};

const getCheckDefinitions = () => {
    const definitions = {};
    for (const [checkName, checkData] of Object.entries(CHECKS)) {
        definitions[checkName] = checkData.config;
    }
    return definitions;
};

class PlayerData {
    constructor(username, uuid, entityId) {
        this.username = username;
        this.uuid = uuid;
        this.entityId = entityId;
        this.displayName = username;
        
        this.position = { x: 0, y: 0, z: 0 };
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.onGround = true;
        this.lastOnGround = true;
        
        this.yaw = 0;
        this.pitch = 0;
        this.lastYaw = null;
        this.lastPitch = null;
        
        this.isCrouching = false;
        this.lastCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.swingProgress = 0;
        
        this.lastSwingTime = 0;
        this.swingTimestamps = [];
        this.attackQueue = [];
        this.lastCrouchTime = 0;
        this.lastStopCrouchTime = 0;
        
        this.lastPositionData = null;
        this.velocity = { x: 0, y: 0, z: 0 };
        
        this.violations = {};
        this.lastAlerts = {};
        
        for (const checkName of Object.keys(CHECKS)) {
            this.violations[checkName] = 0;
            this.lastAlerts[checkName] = 0;
        }

        this.globalViolations = 0;
        this.lastGlobalAlertTime = 0;

        this.alertCountInWindow = 0;
        this.alertWindowStartTime = 0;
        
        this.lastSwingItem = null;
        this.hasJumpBoost = false;
        
        this.shiftEvents = [];
        this.currentShiftStart = null;
        
        this.heldItem = null;
        
        this.lastSprinting = false;
        this.lastUsing = false;
        this.lastDamaged = 0;
        
        this.isBlocking = false;
        this.blockingStartTime = 0;

        this.isSwimming = false;
        this.isElytraFlying = false;
        this.isInWater = false;
        this.isInWeb = false;
        this.isOnFire = false;
        this.isInLava = false;
        this.isInsideBlock = false;
        this.isOnMagmaBlock = false;
        this.isPassenger = false;
        this.isCurrentPlayer = false;

        this.activeEffects = new Map();

        this.flyA = {
            zeroVelocityTicks: 0
        };

        this.flyC = {
            lastVelocityY: null,
            repeatTicks: 0
        };

        this.velocityA = {
            isChecking: false,
            checkTicks: 0,
            noChangeTicks: 0,
            lastHurtPos: null,
            fallDamageDisableTicks: 0
        };

        this.scaffoldA = {
            isCurrentlySwinging: false,
            swingTimeout: null
        };

        this.speedLevel = 0;
        this.fallDistance = 0;
        this.jumpBoostLevel = 0;
        this.highestY = 0;
        this.jumpStartY = 0;
        this.lastOnGroundY = 0;
        this.lastOnLiquidGround = false;
        this.flaggedInJump = false;

        this.lastVelocityPacketTime = 0;
        this.itemUseTick = 0;
        this.noSlowDisableTicks = 0;
        this.lastJumpTime = 0;
        this.hunger = 20;
        this.hasSlowFalling = false;
        this.hurtTime = 0;
        this.latency = 0;
        this.lastTeleportTime = Date.now();
        this.gameMode = -1; // -1: unknown, 0: survival, 1: creative, 2: adventure, 3: spectator

        this.strafeA = {
            lastMotionX: null,
            lastMotionZ: null
        };
    }
    
    updatePosition(x, y, z, onGround, yaw = null, pitch = null) {
        // In updatePosition method
        if (onGround) {
            if (this.fallDistance > 3.0) { // If fall distance was more than 3 blocks (1.5 hearts)
                // Disable Velocity check for 2 ticks (40ms) to allow for bounce
                this.velocityA.fallDamageDisableTicks = 2;
            }
            this.fallDistance = 0;
        } else if (y < this.position.y) {
            this.fallDistance += this.position.y - y;
        }

        if (this.lastOnGround && !onGround && y > this.position.y) {
            this.lastJumpTime = Date.now();
        }

        this.lastPosition = { ...this.position };
        this.position = { x, y, z };
        this.onGround = onGround;
        
        if (yaw !== null) {
            this.lastYaw = this.yaw;
            this.yaw = yaw;
        }
        if (pitch !== null) {
            this.lastPitch = this.pitch;
            this.pitch = pitch;
        }
        
        const currentTime = Date.now();
        let calculatedVelocity = { x: 0, y: 0, z: 0 };
        
        if (this.lastPositionData) {
            const timeDelta = (currentTime - this.lastPositionData.timestamp) / 1000;
            
            if (timeDelta > 0) {
                calculatedVelocity = {
                    x: (x - this.lastPositionData.position.x) / timeDelta,
                    y: (y - this.lastPositionData.position.y) / timeDelta,
                    z: (z - this.lastPositionData.position.z) / timeDelta
                };
            }
        }
        
        this.velocity = calculatedVelocity;

        this.strafeA.lastMotionX = this.velocity.x;
        this.strafeA.lastMotionZ = this.velocity.z;
        
        this.lastPositionData = {
            position: { x, y, z },
            timestamp: currentTime
        };
        
        this.lastOnGround = onGround;
    }
    
    getItemId() {
        if (!this.heldItem) return null;
        return this.heldItem.blockId || this.heldItem.itemId || this.heldItem.id || null;
    }
    
    isHoldingBlock() {
        const itemId = this.getItemId();
        return itemId && itemId < 256;
    }
    
    isHoldingSword() {
        const itemId = this.getItemId();
        if (!itemId) return false;
        const swordIds = [267, 268, 272, 276, 283]; // wood, stone, iron, diamond, gold swords
        return swordIds.includes(itemId);
    }
    
    isHoldingBow() {
        const itemId = this.getItemId();
        return itemId === 261;
    }
    
    isHoldingConsumable() {
        const itemId = this.getItemId();
        if (!itemId) return false;
        const consumableIds = [
            260, // apple
            297, // bread
            319, // porkchop
            320, // cooked_porkchop
            322, // golden_apple
            335, // milk_bucket
            349, // fish
            350, // cooked_fish
            354, // cake (item)
            357, // cookie
            360, // melon_slice
            363, // beef
            364, // cooked_beef
            365, // chicken
            366, // cooked_chicken
            367, // rotten_flesh
            373, // potion
            391, // carrot
            392, // potato
            393, // baked_potato
            394, // poisonous_potato
            396, // golden_carrot
            400, // pumpkin_pie
            411, // rabbit
            412, // cooked_rabbit
            413, // rabbit_stew
            423, // mutton
            424  // cooked_mutton
        ];
        return consumableIds.includes(itemId);
    }
}

class AnticheatSystem {
    constructor(api) {
        this.api = api;
        this.players = new Map();
        this.playersByUuid = new Map();
        this.entityToPlayer = new Map();
        this.uuidToName = new Map();
        this.uuidToDisplayName = new Map();
        this.userPosition = null;
        this.playersWithSuffix = new Set();
        this.gracePeriodEnd = 0;

        this.CONFIG = {};
        this.refreshConfigConstants();
    }

    isValidPlayerUuid(uuid) {
        // Real player UUIDs are version 4. Many NPCs use version 2.
        // This checks the version nibble of the UUID.
        // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        return typeof uuid === 'string' && uuid.length === 36 && uuid[14] === '4';
    }

    startGracePeriod(duration = 5000) {
        this.gracePeriodEnd = Date.now() + duration;
        this.api.debugLog(`[AC] Grace period started. Checks paused for ${duration / 1000}s.`);
    }
    
    reset() {
        this.players.clear();
        this.playersByUuid.clear();
        this.entityToPlayer.clear();
        this.uuidToName.clear();
        this.uuidToDisplayName.clear();
        this.startGracePeriod();
        this.api.debugLog('Cleared all tracked player data and started grace period.');
    }

    flushViolations() {
        for (const player of this.playersByUuid.values()) {
            for (const checkName of Object.keys(CHECKS)) {
                if (player.violations[checkName] !== undefined) {
                    player.violations[checkName] = 0;
                }
                if (player.lastAlerts[checkName] !== undefined) {
                    player.lastAlerts[checkName] = 0;
                }
            }
            player.globalViolations = 0;
            player.lastGlobalAlertTime = 0;
            player.alertCountInWindow = 0; // Reset alert count for tab list
            player.alertWindowStartTime = 0; // Reset alert window start time
            this.updateTabList(player);
        }
    }
    
    refreshConfigConstants() {
        this.CONFIG = {};
        for (const checkName of Object.keys(CHECKS)) {
            // Only load config for checks that are still defined in CHECKS
            if (CHECKS[checkName]) {
                this.CONFIG[checkName] = {
                    enabled: this.api.config.get(`checks.${checkName}.enabled`),
                    vl: this.api.config.get(`checks.${checkName}.vl`),
                    cooldown: this.api.config.get(`checks.${checkName}.cooldown`),
                    sound: this.api.config.get(`checks.${checkName}.sound`),
                    alertBuffer: this.api.config.get(`checks.${checkName}.alertBuffer`),
                    autoWdr: this.api.config.get(`checks.${checkName}.autoWdr`),
                    runCheckOnSelf: this.api.config.get(`checks.${checkName}.runCheckOnSelf`)
                };
            }
        }
        // GlobalAlerts config is removed from schema, but still referenced here.
        // Ensure it doesn't cause errors if not found in config.
        this.CONFIG.globalAlerts = {
            enabled: this.api.config.get('globalAlerts.enabled') ?? false, // Default to false if not found
            threshold: this.api.config.get('globalAlerts.threshold') ?? 20,
            cooldown: this.api.config.get('globalAlerts.cooldown') ?? 5000
        };
        this.CONFIG.globalRateLimit = {
            enabled: this.api.config.get('globalRateLimit.enabled'),
            maxAlerts: this.api.config.get('globalRateLimit.maxAlerts'),
            timeWindow: this.api.config.get('globalRateLimit.timeWindow')
        };
    }
    
    registerHandlers() {
        this.unsubscribeTick = this.api.everyTick(() => {
            const now = Date.now();
            for (const [uuid, player] of this.playersByUuid) {
                if (player.swingProgress > 0) {
                    player.swingProgress = Math.max(0, player.swingProgress - 1);
                }
                if (player.hurtTime > 0) {
                    player.hurtTime--;
                }
            }
        });

        this.unsubscribeUpdateHealth = this.api.on('update_health', (event) => {
            this.handleUpdateHealth(event);
        });

        this.unsubscribePluginRestored = this.api.on('plugin_restored', (event) => {
            if (event.pluginName === 'anticheat') {
                this.reset();
            }
        });

        
        this.unsubscribeEntityMove = this.api.on('entity_move', (event) => {
            if (event.isPlayer && event.entity) {
                this.handleEntityMove(event);
            }
        });
        
        this.unsubscribeEntityAnimation = this.api.on('entity_animation', (event) => {
            if (event.isPlayer && event.entity) {
                this.handleEntityAnimation(event);
            }
        });
        
        this.unsubscribePlayerJoin = this.api.on('player_join', (event) => {
            this.handlePlayerJoin(event);
        });
        
        this.unsubscribePlayerLeave = this.api.on('player_leave', (event) => {
            this.handlePlayerLeave(event);
        });
        
        this.unsubscribeRespawn = this.api.on('respawn', () => {
            this.reset();
        });
        
        this.unsubscribePlayerInfo = this.api.on('player_info', (event) => {
            this.handlePlayerListUpdate(event);
        });
        
        this.unsubscribeEntitySpawn = this.api.on('named_entity_spawn', (event) => {
            this.handlePlayerSpawn(event);
        });
        
        this.unsubscribeEntityDestroy = this.api.on('entity_destroy', (event) => {
            this.handleEntityRemove(event);
        });
        
        this.unsubscribeEntityMetadata = this.api.on('entity_metadata', (event) => {
            this.handleEntityMetadataFromEvent(event);
        });
        
        this.unsubscribeEntityEquipment = this.api.on('entity_equipment', (event) => {
            this.handleEntityEquipmentFromEvent(event);
        });
        
        this.unsubscribeEntityStatus = this.api.on('entity_status', (event) => {
            this.handleEntityStatusFromEvent(event);
        });
        
        this.unsubscribePosition = this.api.on('player_move', (event) => {
            if (event.player && event.player.isCurrentPlayer) {
                this.handlePlayerMove(event);
            }
        });

        this.unsubscribeAddEntityEffect = this.api.on('add_entity_effect', (event) => {
            this.handleEntityEffect(event);
        });

        this.unsubscribeRemoveEntityEffect = this.api.on('remove_entity_effect', (event) => {
            this.handleRemoveEntityEffect(event);
        });

        this.unsubscribeEntityVelocity = this.api.on('entity_velocity', (event) => {
            this.handleEntityVelocity(event);
        });

        this.unsubscribePlayerTeleport = this.api.on('player_teleport', (event) => {
            this.handlePlayerTeleport(event);
        });

        this.unsubscribeBlockPlace = this.api.on('block_place', (event) => {
            this.handleBlockPlace(event);
        });
    }

    handleUpdateHealth(event) {
        const currentPlayer = this.api.getCurrentPlayer();
        if (!currentPlayer) return;

        const player = this.playersByUuid.get(currentPlayer.uuid);
        if (!player) return;

        if (event.hunger !== undefined) {
            player.hunger = event.hunger;
        }
    }

    handlePlayerTeleport(event) {
        if (!event.player || !event.player.uuid) return;
        const player = this.playersByUuid.get(event.player.uuid);
        if (player) {
            player.lastTeleportTime = Date.now();
            this.api.debugLog(`[AC] Teleport detected for ${player.displayName}. Disabling Blink check temporarily.`);
        }
    }

    handleEntityVelocity(event) {
        if (!event.entity) return;
        const player = this.entityToPlayer.get(event.entity.entityId);
        if (!player) return;

        // We only care about upward velocity from explosions
        if (event.velocityY > 0) {
            player.lastVelocityPacketTime = Date.now();
            this.api.debugLog(`[AC] Received velocity packet for ${player.displayName}, lastVelocityPacketTime set to ${player.lastVelocityPacketTime}`);
        }
    }

    handleEntityEffect(event) {
        if (!event.entity || !event.isPlayer) return;
        const player = this.entityToPlayer.get(event.entity.entityId);
        if (!player) return;

        player.activeEffects.set(event.effectId, event.amplifier + 1);

        if (event.effectId === 8) { // 8 is the ID for Jump Boost
            player.jumpBoostLevel = event.amplifier + 1;
        }
        if (event.effectId === 1) { // 1 is the ID for Speed
            player.speedLevel = event.amplifier + 1;
        }
        if (event.effectId === 25) { // 25 is the ID for Slow Falling
            player.hasSlowFalling = true;
        }
    }

    handleRemoveEntityEffect(event) {
        if (!event.entity || !event.isPlayer) return;
        const player = this.entityToPlayer.get(event.entity.entityId);
        if (!player) return;

        player.activeEffects.delete(event.effectId);

        if (event.effectId === 8) { // 8 is the ID for Jump Boost
            player.jumpBoostLevel = 0;
        }
        if (event.effectId === 1) { // 1 is the ID for Speed
            player.speedLevel = 0;
        }
        if (event.effectId === 25) { // 25 is the ID for Slow Falling
            player.hasSlowFalling = false;
        }
    }

    handlePlayerMove(event) {
        const currentPlayer = this.api.getCurrentPlayer();
        if (!currentPlayer) return;

        const player = this.getOrCreatePlayer({
            name: currentPlayer.name,
            uuid: currentPlayer.uuid,
            entityId: currentPlayer.entityId,
            displayName: currentPlayer.displayName
        });

        if (!player) return;

        player.isCurrentPlayer = true;

        if (event.position) {
            player.updatePosition(
                event.position.x,
                event.position.y,
                event.position.z,
                event.onGround,
                event.rotation?.yaw,
                event.rotation?.pitch
            );
        }
        
        this.runChecks(player);
    }
    
    handleEntityMove(event) {
        if (!event.entity || event.entity.type !== 'player' || !event.entity.uuid) return;
        
        const playerInfo = this.api.getPlayerInfo(event.entity.uuid);
        const playerName = playerInfo?.name || this.uuidToName.get(event.entity.uuid) || 'Unknown';
        const displayName = this.uuidToDisplayName.get(event.entity.uuid) || playerName;
        
        const playerData = {
            name: playerName,
            uuid: event.entity.uuid,
            entityId: event.entity.entityId,
            displayName: displayName
        };
        
        const player = this.getOrCreatePlayer(playerData);
        if (!player) {
            return;
        }
        
        if (event.newPosition) {
            player.updatePosition(
                event.newPosition.x,
                event.newPosition.y,
                event.newPosition.z,
                true,
                event.rotation?.yaw,
                event.rotation?.pitch
            );
        } else if (event.delta) {
            const newX = player.position.x + event.delta.x;
            const newY = player.position.y + event.delta.y;
            const newZ = player.position.z + event.delta.z;
            
            player.updatePosition(
                newX,
                newY,
                newZ,
                event.onGround !== undefined ? event.onGround : player.onGround,
                event.rotation?.yaw,
                event.rotation?.pitch
            );
        }
        
        this.runChecks(player);
    }
    
    handleEntityAnimation(event) {
        if (!event.entity || event.entity.type !== 'player' || !event.entity.uuid) return;
        
        const playerInfo = this.api.getPlayerInfo(event.entity.uuid);
        const playerName = playerInfo?.name || this.uuidToName.get(event.entity.uuid) || 'Unknown';
        const displayName = this.uuidToDisplayName.get(event.entity.uuid) || playerName;
        
        const playerData = {
            name: playerName,
            uuid: event.entity.uuid,
            entityId: event.entity.entityId,
            displayName: displayName
        };
        
        const player = this.getOrCreatePlayer(playerData);
        if (!player) return;
        
        if (event.animation === 0) { // Swing animation
            const now = Date.now();
            player.swingProgress = 6;
            player.lastSwingTime = now;
            player.lastSwingItem = player.heldItem;

            // ---- START: NEW AUTOCLICKER LOGIC ----
            const config = this.CONFIG['AutoClickerA'];
            if (config && config.enabled) {
                player.swingTimestamps.push(now);
                if (player.swingTimestamps.length > 50) {
                    player.swingTimestamps.shift();
                }

                if (player.swingTimestamps.length >= 4) {
                    const clicks = player.swingTimestamps;
                    const lastClickIndex = clicks.length - 1;

                    // Compare the most recent delay with the one before it
                    const delay1 = clicks[lastClickIndex] - clicks[lastClickIndex - 1];
                    const delay2 = clicks[lastClickIndex - 2] - clicks[lastClickIndex - 3];

                    if (Math.abs(delay1 - delay2) < (config.minDiffMs || 5)) {
                        this.addViolation(player, 'AutoClickerA', 1);
                        if (this.shouldAlert(player, 'AutoClickerA', config)) {
                            this.flag(player, 'AutoClickerA', player.violations.AutoClickerA);
                            this.markAlert(player, 'AutoClickerA');
                        }
                    }
                }
            }
            // ---- END: NEW AUTOCLICKER LOGIC ----

            // Delayed check for HitBoxA and ReachA (this part remains)
            setTimeout(() => {
                this.performAttackChecks(player);
            }, 100);
        }
        
        this.runChecks(player); // This will no longer run the old AutoClickerA check
    }
    
    handlePlayerJoin(event) {
        this.api.debugLog(`Player joined: ${event.player.name}`);
        const player = this.getOrCreatePlayer(event.player);
        if (!player) {
            this.api.debugLog(`[AC] Ignored non-player entity with name ${event.player.name} from join event.`);
        }
    }
    
    handlePlayerLeave(event) {
        if (event.player && event.player.uuid) {
            this.removePlayerByUuid(event.player.uuid);
        }
    }
    
    getOrCreatePlayer(playerData) {
        if (!this.isValidPlayerUuid(playerData.uuid)) {
            return null;
        }

        let player = this.playersByUuid.get(playerData.uuid);
        
        if (!player) {
            // Player is new, create a new record
            player = new PlayerData(playerData.name, playerData.uuid, playerData.entityId || -1);
            this.playersByUuid.set(playerData.uuid, player);
        }

        // --- START: SIMPLIFIED UPDATE LOGIC ---
        // Always keep the player's data up-to-date from the latest event.
        player.displayName = playerData.displayName || playerData.name || player.username;
        player.username = playerData.name || player.username;

        // If the entityId has changed, update the entity map
        if (playerData.entityId && player.entityId !== playerData.entityId) {
            if (player.entityId !== -1) {
                this.entityToPlayer.delete(player.entityId);
            }
            player.entityId = playerData.entityId;
        }
        
        // Always ensure the entityId maps to this player object
        if (player.entityId !== -1) {
            this.entityToPlayer.set(player.entityId, player);
        }
        // --- END: SIMPLIFIED UPDATE LOGIC ---
        
        return player;
    }
    
    removePlayerByUuid(uuid) {
        const player = this.playersByUuid.get(uuid);
        if (player) {
            this.players.delete(player.username);
            this.playersByUuid.delete(uuid);

            for (const [entityId, p] of this.entityToPlayer) {
                if (p.uuid === uuid) {
                    this.entityToPlayer.delete(entityId);
                    break;
                }
            }
        }
    }
    
    handlePlayerListUpdate(event) {
        if (event.players) {
            event.players.forEach(update => {
                if (update.name && update.uuid) {
                    this.uuidToName.set(update.uuid, update.name);
                    const player = this.playersByUuid.get(update.uuid);
                    if (player) {
                        if (update.ping !== undefined) {
                            player.latency = update.ping;
                        }
                        if (update.gamemode !== undefined && player.gameMode !== -1 && player.gameMode !== update.gamemode) {
                            const config = this.CONFIG['GameModeA'];
                            if (config && config.enabled) {
                                this.addViolation(player, 'GameModeA', 1);
                                if (this.shouldAlert(player, 'GameModeA', config)) {
                                    this.flag(player, 'GameModeA', player.violations.GameModeA);
                                    this.markAlert(player, 'GameModeA');
                                }
                            }
                        }
                        if (update.gamemode !== undefined) {
                            player.gameMode = update.gamemode;
                        }
                    }
                }
            });
        }
    }
    
    handlePlayerSpawn(event) {
        const data = event.player;

        if (!this.isValidPlayerUuid(data.playerUUID)) {
            //this.api.debugLog(`[AC] Ignored non-player entity from spawn event.`);
            return;
        }
        
        const playerName = this.uuidToName.get(data.playerUUID) || 'Unknown';
        const displayName = this.uuidToDisplayName.get(data.playerUUID) || playerName;
        const player = new PlayerData(playerName, data.playerUUID, data.entityId);
        
        player.displayName = displayName;
        
        player.updatePosition(
            data.position.x,
            data.position.y,
            data.position.z,
            false
        );
        
        player.yaw = data.yaw;
        player.pitch = data.pitch;
        
        this.players.set(playerName, player);
        this.playersByUuid.set(data.playerUUID, player);
        this.entityToPlayer.set(data.entityId, player);
    }
    
    handleEntityRemove(event) {
        event.entities.forEach(entity => {
            const player = this.entityToPlayer.get(entity.entityId);
            if (player) {
                this.players.delete(player.username);
                this.playersByUuid.delete(player.uuid);
                this.entityToPlayer.delete(entity.entityId);
            }
        });
    }
    
    handleEntityMetadataFromEvent(event) {
        if (!event.entity || event.entity.type !== 'player') return;
        
        let player = this.entityToPlayer.get(event.entity.entityId);
        
        if (!player && event.entity.uuid) {
            const playerInfo = this.api.getPlayerInfo(event.entity.uuid);
            const playerName = playerInfo?.name || this.uuidToName.get(event.entity.uuid) || 'Unknown';
            const displayName = this.uuidToDisplayName.get(event.entity.uuid) || playerName;
            
            const playerData = {
                name: playerName,
                uuid: event.entity.uuid,
                entityId: event.entity.entityId,
                displayName: displayName
            };
            player = this.getOrCreatePlayer(playerData);
        }
        
        if (!player) return;
        
        if (event.metadata && Array.isArray(event.metadata)) {
            event.metadata.forEach(meta => {
                if (meta.key === 0 && meta.type === 0) {
                    const flags = meta.value;
                    const currentTime = Date.now();
                    
                    player.isOnFire = !!(flags & 0x01);
                    const wasCrouching = player.isCrouching;
                    player.isCrouching = !!(flags & 0x02);
                    
                    if (player.isCrouching && !wasCrouching) {
                        player.lastCrouchTime = currentTime;
                        player.currentShiftStart = currentTime;
                        player.shiftEvents.push({
                            type: 'start',
                            timestamp: currentTime,
                            position: { ...player.position }
                        });
                        
                        if (player.shiftEvents.length > 50) {
                            player.shiftEvents.shift();
                        }
                    } else if (!player.isCrouching && wasCrouching) {
                        player.lastStopCrouchTime = currentTime;
                        const duration = player.currentShiftStart ? currentTime - player.currentShiftStart : 0;
                        player.shiftEvents.push({
                            type: 'stop',
                            timestamp: currentTime,
                            position: { ...player.position },
                            duration: duration
                        });
                        player.currentShiftStart = null;
                        
                        if (player.shiftEvents.length > 50) {
                            player.shiftEvents.shift();
                        }
                    }
                    
                    player.isSprinting = !!(flags & 0x08);
                    
                    const wasUsingItem = player.isUsingItem;
                    player.isUsingItem = !!(flags & 0x10);
                    
                    if (player.isUsingItem && !wasUsingItem && player.isHoldingSword()) {
                        player.isBlocking = true;
                        player.blockingStartTime = currentTime;
                    } else if (!player.isUsingItem && wasUsingItem) {
                        player.isBlocking = false;
                    }
                    
                    if (player.isUsingItem !== player.lastUsing) {
                        player.lastUsing = player.isUsingItem;
                    }

                    player.isElytraFlying = !!(flags & 0x80);
                }
                if (meta.key === 9 && meta.type === 0) { // In water
                    player.isInWater = meta.value > 0;
                }
                // These keys might not be standard, adjust if needed from packet sniffing
                if (meta.key === 26 && meta.type === 0) { // In lava (hypothetical)
                    player.isInLava = meta.value > 0;
                }
                if (meta.key === 27 && meta.type === 0) { // In web (hypothetical)
                    player.isInWeb = meta.value > 0;
                }
            });
        }
        
        this.runChecks(player);
    }
    
    handleEntityEquipmentFromEvent(event) {
        if (!event.entity || !event.isPlayer) return;
        
        const player = this.entityToPlayer.get(event.entity.entityId);
        if (!player) return;
        
        if (event.slot === 0) {
            player.heldItem = event.item;
        }
    }
    
    handleEntityStatusFromEvent(event) {
        if (!event.entity) return;
        
        const targetPlayer = this.entityToPlayer.get(event.entity.entityId);
        if (!targetPlayer) return;

        if (event.status === 2) { // Entity hurt
            targetPlayer.lastDamaged = Date.now();
            targetPlayer.hurtTime = 10; // Set hurtTime to 10 ticks
        }
    }
    
    runChecks(player) {
        if (Date.now() < this.gracePeriodEnd) {
            return;
        }

        for (const checkName of Object.keys(CHECKS)) {
            const checkConfig = this.CONFIG[checkName];
            if (!checkConfig || !checkConfig.enabled) continue;
            
            const checkDefinition = CHECKS[checkName];
            if (checkDefinition && checkDefinition.check) {
                checkDefinition.check.call(this, player, checkConfig);
            }
        }
    }
    
    flag(player, checkName, vl) {
        const globalAlertsConfig = this.CONFIG.globalAlerts;
        if (globalAlertsConfig.enabled) {
            // Don't alert for every flag, just increment global violations
            player.globalViolations++;
            this.handleGlobalViolations(player);
        } else {
            // Legacy behavior: alert on every flag
            this.sendAlert(player, checkName, vl);
        }

        const autoWdrEnabled = this.api.config.get(`checks.${checkName}.autoWdr`);
        if (autoWdrEnabled) {
            const cleanName = player.username || player.name || player.displayName?.replace(/§./g, '') || 'Unknown';
            this.api.sendCommand(`/wdr ${cleanName}`);
        }
    }

    handleGlobalViolations(player) {
        const config = this.CONFIG.globalAlerts;
        if (!config.enabled) return;

        const now = Date.now();
        if (player.globalViolations >= config.threshold && (now - player.lastGlobalAlertTime) > config.cooldown) {
            this.sendGlobalAlert(player);
            player.lastGlobalAlertTime = now;
            player.globalViolations = 0; // Reset after alerting
        }
    }

    sendGlobalAlert(player) {
        if (!this.canSendAlert(player)) return;

        const cleanName = player.username || player.name || player.displayName?.replace(/§./g, '') || 'Unknown';
        const team = this.api.getPlayerTeam(cleanName);
        const prefix = team?.prefix || '';
        const suffix = team?.suffix || '';
        const displayName = prefix + cleanName + suffix;

        const totalViolations = Object.values(player.violations).reduce((a, b) => a + b, 0);

        // Find the check with the most violations
        const topCheck = Object.entries(player.violations).reduce((top, current) => {
            return current[1] > top[1] ? current : top;
        }, ["", 0]);

        const wdrCommand = `/wdr ${cleanName}`;

        const components = [
            { text: `${this.api.getPrefix()} ` },
            { text: displayName },
            { text: ` §7is suspicious §8(§7Total VL: ${totalViolations}§8)`, clickEvent: { action: 'run_command', value: wdrCommand }, hoverEvent: { action: 'show_text', value: `Click to report ${cleanName} for ${topCheck[0] || 'Cheating'}` } }
        ];

        this.api.chatInteractive(components);
        this.api.sound('note.pling');
        this.incrementAlertCount(player);
    }

    sendAlert(player, checkName, vl) {
        if (!this.canSendAlert(player)) return;

        const cleanName = player.username || player.name || player.displayName?.replace(/§./g, '') || 'Unknown';
        const team = this.api.getPlayerTeam(cleanName);
        const prefix = team?.prefix || '';
        const suffix = team?.suffix || '';
        const displayName = prefix + cleanName + suffix;

        const wdrCommand = `/wdr ${cleanName}`;
        
        const components = [
            { text: `${this.api.getPrefix()} ` },
            { text: displayName },
            { text: ` §7flagged §5${checkName} §8(§7VL: ${vl}§8)`, clickEvent: { action: 'run_command', value: wdrCommand }, hoverEvent: { action: 'show_text', value: `Click to report ${cleanName} for ${checkName}` } }
        ];

        const urchin = this.api.getPluginInstance('urchin');
        if (urchin) {
            components.push({ text: ' ' });
            components.push({ text: '[Tag]', color: 'dark_purple', clickEvent: { action: 'suggest_command', value: `/urchin tag ${cleanName} blatant_cheater ${checkName}` }, hoverEvent: { action: 'show_text', value: 'Tag player in Urchin' } });
        }

        this.api.chatInteractive(components);

        const soundEnabled = this.api.config.get(`checks.${checkName}.sound`);
        if (soundEnabled) {
            this.api.sound('note.pling');
        }
        this.incrementAlertCount(player);
    }

    performAttackChecks(attacker) {
        // Find the closest entity that was recently hurt
        let closestHurtEntity = null;
        let minDistance = Infinity;

        for (const otherPlayer of this.playersByUuid.values()) {
            if (otherPlayer.uuid === attacker.uuid) continue;
            
            const timeSinceHurt = Date.now() - otherPlayer.lastDamaged;
            if (timeSinceHurt < 150) { // Check for entities hurt in the last 150ms
                const dx = otherPlayer.position.x - attacker.position.x;
                const dy = otherPlayer.position.y - attacker.position.y;
                const dz = otherPlayer.position.z - attacker.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestHurtEntity = otherPlayer;
                }
            }
        }

        if (!closestHurtEntity) {
            return; // No recently hurt entity found, so no checks to perform
        }

        const target = closestHurtEntity;
        const distanceToTarget = minDistance;

        const reachConfig = this.CONFIG['ReachA'];
        const hitboxConfig = this.CONFIG['HitBoxA'];
        const autoBlockConfig = this.CONFIG['AutoBlockA'];

        // AutoBlockA Check
        if (autoBlockConfig.enabled && attacker.isBlocking) {
            if (distanceToTarget > 3.0) {
                this.addViolation(attacker, 'AutoBlockA', 1);
                if (this.shouldAlert(attacker, 'AutoBlockA', autoBlockConfig)) {
                    this.flag(attacker, 'AutoBlockA', attacker.violations.AutoBlockA);
                    this.markAlert(attacker, 'AutoBlockA');
                }
            }
        }

        // ReachA Check
        if (reachConfig.enabled) {
            const MAX_REACH = 6.0;
            const NORMAL_REACH = 3.5;
            if (distanceToTarget > NORMAL_REACH && distanceToTarget < MAX_REACH) {
                this.addViolation(attacker, 'ReachA', 1);
                if (this.shouldAlert(attacker, 'ReachA', reachConfig)) {
                    this.flag(attacker, 'ReachA', attacker.violations.ReachA);
                    this.markAlert(attacker, 'ReachA');
                }
            }
        }

        // HitBoxA Check
        if (hitboxConfig.enabled && this.api.raycast) {
            const EYE_HEIGHT = 1.62;
            const attackerEyePos = { x: attacker.position.x, y: attacker.position.y + EYE_HEIGHT, z: attacker.position.z };
            const targetPos = target.position;
            const MAX_DISTANCE = 6.0;
            
            const raycastResult = this.api.raycast(attackerEyePos, targetPos, MAX_DISTANCE);

            if (raycastResult && raycastResult.type === 'block') {
                // Check if the block is between the attacker and the target
                const distToBlock = Math.sqrt(Math.pow(raycastResult.pos.x - attackerEyePos.x, 2) + Math.pow(raycastResult.pos.y - attackerEyePos.y, 2) + Math.pow(raycastResult.pos.z - attackerEyePos.z, 2));
                if (distToBlock < distanceToTarget) {
                    this.addViolation(attacker, 'HitBoxA', 1);
                    if (this.shouldAlert(attacker, 'HitBoxA', hitboxConfig)) {
                        this.flag(attacker, 'HitBoxA', attacker.violations.HitBoxA);
                        this.markAlert(attacker, 'HitBoxA');
                    }
                }
            }
        }
    }
    
    cleanup() {
        if (this.unsubscribeTick) this.unsubscribeTick();
        if (this.unsubscribePluginRestored) this.unsubscribePluginRestored();
        if (this.unsubscribeEntityMove) this.unsubscribeEntityMove();
        if (this.unsubscribeEntityAnimation) this.unsubscribeEntityAnimation();
        if (this.unsubscribePlayerJoin) this.unsubscribePlayerJoin();
        if (this.unsubscribePlayerLeave) this.unsubscribePlayerLeave();
        if (this.unsubscribeRespawn) this.unsubscribeRespawn();
        if (this.unsubscribePlayerInfo) this.unsubscribePlayerInfo();
        if (this.unsubscribeEntitySpawn) this.unsubscribeEntitySpawn();
        if (this.unsubscribeEntityDestroy) this.unsubscribeEntityDestroy();
        if (this.unsubscribeEntityMetadata) this.unsubscribeEntityMetadata();
        if (this.unsubscribeEntityEquipment) this.unsubscribeEntityEquipment();
        if (this.unsubscribeEntityStatus) this.unsubscribeEntityStatus();
        if (this.unsubscribePosition) this.unsubscribePosition();
        if (this.unsubscribeUpdateHealth) this.unsubscribeUpdateHealth();
        if (this.unsubscribeAddEntityEffect) this.unsubscribeAddEntityEffect();
        if (this.unsubscribeRemoveEntityEffect) this.unsubscribeRemoveEntityEffect();
        if (this.unsubscribeEntityVelocity) this.unsubscribeEntityVelocity();
        if (this.unsubscribePlayerTeleport) this.unsubscribePlayerTeleport();
        if (this.unsubscribeBlockPlace) this.unsubscribeBlockPlace();

        for (const uuid of this.playersWithSuffix) {
            this.api.clearDisplayNameSuffix(uuid);
        }
        this.playersWithSuffix.clear();

        this.reset();
    }

    canSendAlert(player) {
        const config = this.CONFIG.globalRateLimit;
        if (!config.enabled) {
            return true;
        }

        const now = Date.now();
        if (now - player.alertWindowStartTime > config.timeWindow) {
            return true;
        }

        return player.alertCountInWindow < config.maxAlerts;
    }

    incrementAlertCount(player) {
        const config = this.CONFIG.globalRateLimit;
        const now = Date.now();

        // Always increment the alert count for display purposes
        player.alertCountInWindow++;

        // Apply window logic only if global rate limiting is enabled
        if (config.enabled) {
            if (now - player.alertWindowStartTime > config.timeWindow) {
                player.alertWindowStartTime = now;
                player.alertCountInWindow = 1; // Reset count for new window
            }
        }
        this.updateTabList(player);
    }
    
    extractTextFromJSON(jsonText) {
        if (typeof jsonText === 'string') {
            return jsonText;
        }
        
        let result = '';
        
        if (jsonText.text) {
            result += jsonText.text;
        }
        
        if (jsonText.extra && Array.isArray(jsonText.extra)) {
            for (const extra of jsonText.extra) {
                if (typeof extra === 'string') {
                    result += extra;
                } else if (extra.text) {
                    result += extra.text;
                }
            }
        }
        
        return result || 'Unknown';
    }
    
    addViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] += amount;
            player.globalViolations += amount;
            this.updateTabList(player);
        }
    }
    
    reduceViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] = Math.max(0, player.violations[checkName] - amount);
            this.updateTabList(player);
        }
    }
    
    shouldAlert(player, checkName, config) {
        const currentViolations = player.violations[checkName];
        const alertBuffer = config.alertBuffer || 1;

        // Initial alert based on vl and cooldown
        if (currentViolations === config.vl) {
            const timeSinceLastAlert = Date.now() - player.lastAlerts[checkName];
            const cooldownPassed = timeSinceLastAlert > config.cooldown;
            return cooldownPassed;
        }

        // Subsequent alerts based on alertBuffer
        if (currentViolations > config.vl) {
            if (currentViolations % alertBuffer === 0) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts[checkName];
                const cooldownPassed = timeSinceLastAlert > config.cooldown;
                return cooldownPassed;
            }
        }
        
        return false;
    }
    
    markAlert(player, checkName) {
        if (player.lastAlerts[checkName] !== undefined) {
            player.lastAlerts[checkName] = Date.now();
        }
    }

    updateTabList(player) {
        if (!this.api.config.get('tabListDisplay.enabled')) {
            if (this.playersWithSuffix.has(player.uuid)) {
                this.api.clearDisplayNameSuffix(player.uuid);
                this.playersWithSuffix.delete(player.uuid);
            }
            return;
        }

        const totalAlerts = player.alertCountInWindow;

        // Clear previous suffix before adding a new one to prevent stacking
        if (this.playersWithSuffix.has(player.uuid)) {
            this.api.clearDisplayNameSuffix(player.uuid);
            this.playersWithSuffix.delete(player.uuid);
        }

        if (totalAlerts > 0) {
            const suffix = ` §7[§c${totalAlerts}§7]`;
            this.api.appendDisplayNameSuffix(player.uuid, suffix);
            this.playersWithSuffix.add(player.uuid);
        }
    }

    shouldCheckVelocity(player) {
        const POISON_ID = 19;
        const WITHER_ID = 20;
        const LEVITATION_ID = 25;
    
        const recentlyBoosted = (Date.now() - player.lastVelocityPacketTime) < 2000;

        // Assuming hard difficulty for hunger damage, as server difficulty isn't available.
        const hasHungerDamage = player.hunger === 0;

        return !(
            player.isElytraFlying ||
            player.isPassenger ||
            player.isOnFire ||
            player.isInWeb ||
            player.isInWater ||
            player.isInLava ||
            player.isInsideBlock ||
            player.isOnMagmaBlock ||
            player.hasSlowFalling ||
            recentlyBoosted ||
            hasHungerDamage || // Added hunger damage check
            player.activeEffects.has(POISON_ID) ||
            player.activeEffects.has(WITHER_ID) ||
            player.activeEffects.has(LEVITATION_ID)
        );
    }

    handleBlockPlace(event) {
        // This event is often sent for the current player.
        // We need to find the player object for the current user.
        const currentPlayer = this.api.getCurrentPlayer();
        if (!currentPlayer) return;

        const player = this.playersByUuid.get(currentPlayer.uuid);
        if (!player) return;

        const config = this.CONFIG['ScaffoldA'];
        if (!config || !config.enabled) return;

        // Check if the player is currently swinging.
        if (!player.scaffoldA.isCurrentlySwinging) {
            this.addViolation(player, 'ScaffoldA', 1);
            if (this.shouldAlert(player, 'ScaffoldA', config)) {
                this.flag(player, 'ScaffoldA', player.violations.ScaffoldA);
                this.markAlert(player, 'ScaffoldA');
            }
        }
    }

    registerCommands() {
        this.api.commands((registry) => {
            registry.command('lookup')
                .description('Look up a player\'s violation data for the current session.')
                .argument('<player>', { description: 'The name of the player to look up.' })
                .handler((ctx) => {
                    const { player: playerName } = ctx.args;
                    const player = this.players.get(playerName) || [...this.players.values()].find(p => p.displayName.replace(/§./g, '').toLowerCase() === playerName.toLowerCase());

                    if (player) {
                        ctx.send(`§8§m---§r §cAnticheat Lookup: ${player.displayName} §8§m---`);
                        ctx.send(`§7Total Violations: §c${player.globalViolations}`);
                        for (const [checkName, vl] of Object.entries(player.violations)) {
                            if (vl > 0) {
                                ctx.send(`§8- §5${checkName}: §c${vl}`);
                            }
                        }
                        ctx.send('§8§m---------------------------------');
                    } else {
                        ctx.sendError('Player not found or no data for this session.');
                    }
                });

            registry.command('flush')
                .description('Clears all violation data for all players in the current session.')
                .handler((ctx) => {
                    this.flushViolations();
                    ctx.sendSuccess('All violation data has been cleared.');
                });
        });
    }
}
