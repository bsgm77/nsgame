import Phaser from 'phaser';

class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  create() {
    // 현재 화면 크기 (모니터에 따라 다름)
    this.W = this.scale.width;
    this.H = this.scale.height;

    // 플레이어 (파란 사각형, 항상 화면 정중앙에서 시작)
    this.player = this.add.rectangle(this.W / 2, this.H / 2, 40, 40, 0x3498db);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, this.W, this.H);

    // 캐릭터 이름
    this.characterName = 'Blue';

    this.nameTag = this.add.text(this.player.x, this.player.y - 45, this.characterName, {
      fontSize: '13px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // 캐릭터 머리 위 체력바 (배경 + 채워지는 바)
    this.headHpBarBg = this.add.rectangle(this.player.x, this.player.y - 32, 44, 6, 0x333333);
    this.headHpBar = this.add.rectangle(this.player.x, this.player.y - 32, 44, 6, 0x2ecc71);

    // 경험치 / 레벨 시스템
    this.exp = 0;
    this.level = 1;
    this.expToNextLevel = 8;

    this.expText = this.add.text(16, 16, 'Lv.1  EXP: 0/5', {
      fontSize: '20px',
      color: '#ffffff'
    });

    // 플레이어 스탯 (레벨업으로 강화됨)
    this.attackPower = 1;
    this.attackSpeedMultiplier = 1;
    this.moveSpeed = 200;
    this.bulletCount = 1;
    this.bulletPierce = false;
    this.dashCooldown = 1000;

    // 레벨업 선택지 관련
    this.upgradeOptionsPool = [
      {
        name: '공격력 +20%',
        desc: '탄환 데미지가 20% 증가합니다',
        color: 0xe74c3c,
        apply: () => { this.attackPower *= 1.2; }
      },
      {
        name: '공격속도 +15%',
        desc: '탄환을 더 빠르게 발사합니다',
        color: 0xf1c40f,
        apply: () => {
          this.attackSpeedMultiplier *= 1.15;
          this.bulletTimer.delay = 900 / this.attackSpeedMultiplier;
        }
      },
      {
        name: '최대 체력 +20',
        desc: '최대 체력이 늘고 그만큼 회복됩니다',
        color: 0x2ecc71,
        apply: () => {
          this.maxHp += 20;
          this.hp += 20;
          this.hpText.setText(`HP: ${this.hp}/${this.maxHp}`);
        }
      },
      {
        name: '이동속도 +15%',
        desc: '캐릭터가 더 빠르게 움직입니다',
        color: 0x1abc9c,
        apply: () => { this.moveSpeed *= 1.15; }
      },
      {
        name: '탄환 개수 +1',
        desc: '탄환이 한 발 더 발사됩니다',
        color: 0xe67e22,
        apply: () => { this.bulletCount += 1; }
      },
      {
        name: '관통 탄환',
        desc: '탄환이 몬스터를 뚫고 지나갑니다',
        color: 0x9b59b6,
        apply: () => { this.bulletPierce = true; }
      },
      {
        name: '대시 쿨타임 -20%',
        desc: '대시를 더 자주 쓸 수 있습니다',
        color: 0x3498db,
        apply: () => { this.dashCooldown *= 0.8; }
      },
      {
        name: '즉시 회복 +30',
        desc: '체력을 즉시 30 회복합니다',
        color: 0xff6b81,
        apply: () => {
          this.hp = Math.min(this.hp + 30, this.maxHp);
          this.hpText.setText(`HP: ${this.hp}/${this.maxHp}`);
        }
      }
    ];

    // 플레이어 HP
    this.hp = 100;
    this.maxHp = 100;
    this.isGameOver = false;

    this.hpText = this.add.text(16, 44, 'HP: 100/100', {
      fontSize: '20px',
      color: '#2ecc71'
    });

    // 생존 시간 / 점수
    this.score = 0;
    this.survivalTime = 0;

    this.timerText = this.add.text(this.W / 2, 16, '00:00', {
      fontSize: '26px',
      color: '#ffffff'
    }).setOrigin(0.5, 0);

    this.scoreText = this.add.text(this.W / 2, 48, 'SCORE: 0', {
      fontSize: '16px',
      color: '#f1c40f'
    }).setOrigin(0.5, 0);

    // 몬스터 그룹
    this.monsters = this.physics.add.group();

    // 탄환 그룹
    this.bullets = this.physics.add.group();

    // 키보드 입력
    this.cursors = this.input.keyboard.createCursorKeys();
    
    // 모바일 여부 감지
    this.isMobile = this.sys.game.device.input.touch;

    // 멀티터치(조이스틱 + 대시 동시 입력) 허용
    this.input.addPointer(2);

    this.joystickActive = false;
    this.joystickStartX = 0;
    this.joystickStartY = 0;
    this.joystickDirX = 0;
    this.joystickDirY = 0;

    if (this.isMobile) {
      this.createMobileControls();
    }

    // 평타를 쏠 기본 방향 (마지막으로 움직인 방향, 기본은 오른쪽)
    this.lastDirX = 1;
    this.lastDirY = 0;
    
    // 대시용 스페이스바 입력
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.isDashing = false;
    this.canDash = true;
    this.isInvincible = false;

    // 1초마다 몬스터 하나씩 생성
    this.time.addEvent({
      delay: 1000,
      callback: this.spawnMonster,
      callbackScope: this,
      loop: true
    });

    // 30초 후부터 원거리 몬스터 등장 시작
    this.time.delayedCall(30000, () => {
      this.time.addEvent({
        delay: 2000,
        callback: this.spawnRangedMonster,
        callbackScope: this,
        loop: true
      });
    });

    // 적 탄환 그룹
    this.enemyBullets = this.physics.add.group();

    // 0.8초마다 자동으로 탄환 발사
    this.bulletTimer = this.time.addEvent({
      delay: 800,
      callback: this.shootBullet,
      callbackScope: this,
      loop: true
    });

    // 탄환이 몬스터에 맞으면 실행되는 부분
    this.physics.add.overlap(this.bullets, this.monsters, this.hitMonster, null, this);

    // 적 탄환이 플레이어에 맞으면 실행되는 부분
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitPlayer, null, this);

    // 몬스터가 플레이어에 닿으면 실행되는 부분
    this.physics.add.overlap(this.monsters, this.player, this.hitPlayerByMonster, null, this);

    // 화면 크기가 바뀔 때(회전 포함) 대응
    this.scale.on('resize', (gameSize) => {
      this.W = gameSize.width;
      this.H = gameSize.height;

      this.physics.world.setBounds(0, 0, this.W, this.H);

      if (this.timerText) this.timerText.setX(this.W / 2);
      if (this.scoreText) this.scoreText.setX(this.W / 2);

      if (this.dashButton) {
        this.dashButton.setPosition(this.W - 90, this.H - 90);
      }
      if (this.dashButtonText) {
        this.dashButtonText.setPosition(this.W - 90, this.H - 90);
      }

      // 플레이어가 화면 밖으로 나가지 않도록 위치 보정
      if (this.player) {
        this.player.x = Phaser.Math.Clamp(this.player.x, 20, this.W - 20);
        this.player.y = Phaser.Math.Clamp(this.player.y, 20, this.H - 20);
      }

      // 레벨업 선택 화면이 떠 있는 상태로 회전했다면 다시 그리기
      if (this.isChoosingUpgrade && this.upgradeUI) {
        this.upgradeUI.forEach((el) => el.destroy());
        this.showUpgradeChoicesLayout();
      }
    });

    

  }
  
  createMobileControls() {
    // 조이스틱 배경 (왼쪽 하단, 반투명 원)
    this.joystickBase = this.add.circle(0, 0, 60, 0xffffff, 0.15)
      .setScrollFactor(0).setDepth(200).setVisible(false);
    this.joystickThumb = this.add.circle(0, 0, 28, 0xffffff, 0.35)
      .setScrollFactor(0).setDepth(201).setVisible(false);

    // 대시 버튼 (오른쪽 하단)
    this.dashButton = this.add.circle(this.W - 90, this.H - 90, 50, 0xf1c40f, 0.35)
      .setScrollFactor(0).setDepth(200).setInteractive();
    this.dashButtonText = this.add.text(this.W - 90, this.H - 90, 'DASH', {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    this.dashButton.on('pointerdown', () => {
      if (this.canDash) this.dash();
    });

    // 조이스틱은 자신을 시작시킨 손가락(pointer id)만 추적해서, 대시 손가락과 안 섞이게 함
    this.joystickPointerId = null;

    this.input.on('pointerdown', (pointer) => {
      if (pointer.x < this.W / 2 && this.joystickPointerId === null) {
        this.joystickPointerId = pointer.id;
        this.joystickActive = true;
        this.joystickStartX = pointer.x;
        this.joystickStartY = pointer.y;
        this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
        this.joystickThumb.setPosition(pointer.x, pointer.y).setVisible(true);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.joystickActive || pointer.id !== this.joystickPointerId) return;

      const dx = pointer.x - this.joystickStartX;
      const dy = pointer.y - this.joystickStartY;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 60);
      const angle = Math.atan2(dy, dx);

      this.joystickDirX = Math.cos(angle) * (dist / 60);
      this.joystickDirY = Math.sin(angle) * (dist / 60);

      this.joystickThumb.setPosition(
        this.joystickStartX + Math.cos(angle) * dist,
        this.joystickStartY + Math.sin(angle) * dist
      );
    });

    this.input.on('pointerup', (pointer) => {
      if (pointer.id === this.joystickPointerId) {
        this.joystickPointerId = null;
        this.joystickActive = false;
        this.joystickDirX = 0;
        this.joystickDirY = 0;
        this.joystickBase.setVisible(false);
        this.joystickThumb.setVisible(false);
      }
    });
  }

  spawnMonster() {
    const edge = Phaser.Math.Between(0, 3);
    let x, y;

    if (edge === 0) { x = Phaser.Math.Between(0, this.W); y = -20; }
    else if (edge === 1) { x = Phaser.Math.Between(0, this.W); y = this.H + 20; }
    else if (edge === 2) { x = -20; y = Phaser.Math.Between(0, this.H); }
    else { x = this.W + 20; y = Phaser.Math.Between(0, this.H); }

    const monster = this.add.rectangle(x, y, 30, 30, 0xe74c3c);
    this.physics.add.existing(monster);
    monster.hp = 1 + (this.level - 1) * 0.2;
    this.monsters.add(monster);
  }

  spawnRangedMonster() {
    const edge = Phaser.Math.Between(0, 3);
    let x, y;

    if (edge === 0) { x = Phaser.Math.Between(0, this.W); y = -20; }
    else if (edge === 1) { x = Phaser.Math.Between(0, this.W); y = this.H + 20; }
    else if (edge === 2) { x = -20; y = Phaser.Math.Between(0, this.H); }
    else { x = this.W + 20; y = Phaser.Math.Between(0, this.H); }

    // 보라색 사각형 = 원거리 몬스터
    const monster = this.add.rectangle(x, y, 30, 30, 0x9b59b6);
    this.physics.add.existing(monster);
    monster.isRanged = true;
    monster.hp = 1 + (this.level - 1) * 0.2;
    this.monsters.add(monster);

    // 3초마다 이 몬스터가 플레이어를 향해 탄환 발사
    monster.shootTimer = this.time.addEvent({
      delay: 3000,
      callback: () => {
        // 몬스터가 이미 죽었으면 발사하지 않음
        if (!monster.active) {
          monster.shootTimer.remove();
          return;
        }
        const enemyBullet = this.add.rectangle(monster.x, monster.y, 12, 12, 0xffffff);
        this.physics.add.existing(enemyBullet);
        this.enemyBullets.add(enemyBullet);
        this.physics.moveToObject(enemyBullet, this.player, 250);
      },
      loop: true
    });
  }

  hitPlayer(playerObj, enemyBullet) {
    if (!enemyBullet.active) return;
    
    enemyBullet.destroy();
    this.takeDamage(10);
  }

  hitPlayerByMonster(monster, player) {
    const now = this.time.now;
    if (monster.lastHitTime && now - monster.lastHitTime < 500) return;
    monster.lastHitTime = now;

    this.takeDamage(5);
  }

  shootBullet() {
    const targets = this.monsters.getChildren();

    // 가장 가까운 몬스터 찾기 (몬스터 있을 때만)
    let closest = null;
    if (targets.length > 0) {
      closest = targets[0];
      let closestDist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, closest.x, closest.y
      );

      targets.forEach((monster) => {
        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, monster.x, monster.y
        );
        if (dist < closestDist) {
          closest = monster;
          closestDist = dist;
        }
      });
    }

    // 탄환 개수만큼 발사 (기본 1개, 레벨업으로 늘어남)
    for (let i = 0; i < this.bulletCount; i++) {
      const bullet = this.add.rectangle(this.player.x, this.player.y, 10, 10, 0xf1c40f);
      this.physics.add.existing(bullet);
      bullet.pierce = this.bulletPierce;
      bullet.hitMonsters = []; // 이미 때린 몬스터 목록 (중복 타격 방지)
      this.bullets.add(bullet);

      if (!closest) {
        // 몬스터 없으면 마지막 이동 방향 기준, 여러 발일 경우 살짝 각도 퍼뜨림
        const spread = (i - (this.bulletCount - 1) / 2) * 0.15;
        const angle = Math.atan2(this.lastDirY, this.lastDirX) + spread;
        bullet.body.setVelocity(Math.cos(angle) * 400, Math.sin(angle) * 400);
      } else if (this.bulletCount === 1) {
        this.physics.moveToObject(bullet, closest, 400);
      } else {
        // 여러 발일 경우 가장 가까운 대상 기준 각도에서 퍼뜨려 발사
        const baseAngle = Phaser.Math.Angle.Between(
          this.player.x, this.player.y, closest.x, closest.y
        );
        const spread = (i - (this.bulletCount - 1) / 2) * 0.2;
        const angle = baseAngle + spread;
        bullet.body.setVelocity(Math.cos(angle) * 400, Math.sin(angle) * 400);
      }
    }
  }

  hitMonster(bullet, monster) {
    if (!bullet.active || !monster.active) return;
    if (monster === this.player) return;

    // 관통 탄환이 같은 몬스터를 이미 때렸으면 무시
    if (bullet.pierce) {
      if (bullet.hitMonsters.includes(monster)) return;
      bullet.hitMonsters.push(monster);
    } else {
      bullet.destroy();
    }

    const damage = Math.ceil(1 * this.attackPower);
    monster.hp -= damage;

    if (monster.hp <= 0) {
      monster.destroy();
      this.gainExp(1);
      this.score += 10;
      this.scoreText.setText(`SCORE: ${this.score}`);
    }
    
    else {
      // 맞았다는 느낌을 주는 살짝 깜빡임
      this.tweens.add({
        targets: monster,
        alpha: 0.3,
        duration: 80,
        yoyo: true
      });
    }
  }

  gainExp(amount) {
    if (this.isChoosingUpgrade) return;

    this.exp += amount;

    if (this.exp >= this.expToNextLevel) {
      this.exp -= this.expToNextLevel;
      this.level += 1;
      this.expToNextLevel = Math.floor(this.expToNextLevel * 1.5);
      this.expText.setText(`Lv.${this.level}  EXP: ${this.exp}/${this.expToNextLevel}`);
      this.showUpgradeChoices();
      return;
    }

    this.expText.setText(`Lv.${this.level}  EXP: ${this.exp}/${this.expToNextLevel}`);
  }

  showUpgradeChoices() {
    this.isChoosingUpgrade = true;

    // 게임 완전히 멈추기
    this.physics.pause();
    this.time.paused = true;

    // 이미 얻은 일회성 옵션(관통 등)은 제외하고 랜덤 3개 뽑기
    const availablePool = this.upgradeOptionsPool.filter((opt) => {
      if (opt.name === '관통 탄환' && this.bulletPierce) return false;
      return true;
    });
    const shuffled = Phaser.Utils.Array.Shuffle([...availablePool]);
    this.currentUpgradeChoices = shuffled.slice(0, 3);

    this.showUpgradeChoicesLayout();
  }

  showUpgradeChoicesLayout() {
    this.upgradeUI = [];

    // 화면 크기에 맞춰 카드 크기를 항상 비례해서 계산 (고정값 대신 비율 기반)
    const titleY = Math.max(24, this.H * 0.1);
    const availableHeight = this.H - titleY - 40; // 타이틀과 하단 여백 뺀 나머지
    const cardHeight = Math.min(260, availableHeight);
    const cardWidth = Math.min(190, this.W / 3 - 30, cardHeight * 0.75);
    const cardY = titleY + 30 + cardHeight / 2;
    const compact = cardWidth < 160;

    // 어두운 반투명 배경
    const overlay = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x000000, 0.75).setDepth(100);
    this.upgradeUI.push(overlay);

    // 상단 타이틀
    const title = this.add.text(this.W / 2, titleY, '레벨 업!', {
      fontSize: compact ? '20px' : '34px',
      color: '#f1c40f',
      fontStyle: 'bold',
      padding: { top: 10, bottom: 10 }
    }).setOrigin(0.5, 0.5).setDepth(100);
    this.upgradeUI.push(title);

    const gap = 20;
    const totalWidth = cardWidth * 3 + gap * 2;
    const startX = this.W / 2 - totalWidth / 2 + cardWidth / 2;

    this.currentUpgradeChoices.forEach((choice, i) => {
      const x = startX + i * (cardWidth + gap);

      const card = this.add.rectangle(x, cardY, cardWidth, cardHeight, 0x1b2838)
        .setStrokeStyle(3, 0x3a5068)
        .setDepth(100)
        .setInteractive({ useHandCursor: true });
      this.upgradeUI.push(card);

      const icon = this.add.circle(x, cardY - cardHeight / 2 + 40, compact ? 18 : 32, choice.color || 0x3498db)
        .setDepth(101);
      this.upgradeUI.push(icon);

      const nameText = this.add.text(x, cardY - cardHeight / 2 + 40 + (compact ? 30 : 65), choice.name, {
        fontSize: compact ? '12px' : '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardWidth - 20 }
      }).setOrigin(0.5).setDepth(101);
      this.upgradeUI.push(nameText);

      const descText = this.add.text(x, cardY + cardHeight / 2 - (compact ? 26 : 55), choice.desc, {
        fontSize: compact ? '9px' : '13px',
        color: '#9fb3c8',
        align: 'center',
        wordWrap: { width: cardWidth - 24 }
      }).setOrigin(0.5).setDepth(101);
      this.upgradeUI.push(descText);

      card.on('pointerover', () => {
        card.setStrokeStyle(3, 0xf1c40f);
        card.setFillStyle(0x24344a);
      });
      card.on('pointerout', () => {
        card.setStrokeStyle(3, 0x3a5068);
        card.setFillStyle(0x1b2838);
      });
      card.on('pointerdown', () => this.selectUpgrade(choice));
    });
  }

  selectUpgrade(choice) {
    choice.apply();

    // UI 전부 제거
    this.upgradeUI.forEach((el) => el.destroy());
    this.upgradeUI = [];

    // 게임 재개
    this.physics.resume();
    this.time.paused = false;
    this.isChoosingUpgrade = false;
  }

  takeDamage(amount) {
    if (this.isGameOver || this.isInvincible) return;

    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;

    this.hpText.setText(`HP: ${this.hp}/${this.maxHp}`);

    // 데미지 숫자 띄우기
    const dmgText = this.add.text(this.player.x, this.player.y - 30, `-${amount}`, {
      fontSize: '22px',
      color: '#ff4d4d'
    }).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => dmgText.destroy()
    });

    if (this.hp <= 0) {
      this.gameOver();
      return;
    }

    // 깜빡임 효과만 (무적 없음)
    this.tweens.killTweensOf(this.player);
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 4,
      onComplete: () => this.player.setAlpha(1)
    });
  }

  gameOver() {
    this.isGameOver = true;
    this.physics.pause();
    this.add.text(this.W / 2, this.H / 2, 'YOU DIED', {
      fontSize: '60px',
      color: '#ff0000'
    }).setOrigin(0.5);
  }

  dash() {
    this.canDash = false;
    this.isDashing = true;
    this.isInvincible = true;

    // 현재 움직이는 방향으로 빠르게 이동
    const dashSpeed = 1500;
    let vx, vy;

    if (this.isMobile && this.joystickActive && (this.joystickDirX !== 0 || this.joystickDirY !== 0)) {
      // 모바일: 조이스틱이 가리키는 방향 우선 사용
      vx = this.joystickDirX;
      vy = this.joystickDirY;
    } else {
      // PC: 현재 이동 속도 기준
      vx = this.player.body.velocity.x;
      vy = this.player.body.velocity.y;
    }

    // 정지 상태에서 대시하면 마지막 이동 방향으로 대시
    if (vx === 0 && vy === 0) {
      vx = this.lastDirX;
      vy = this.lastDirY;
    }

    const length = Math.sqrt(vx * vx + vy * vy);
    this.player.body.setVelocity((vx / length) * dashSpeed, (vy / length) * dashSpeed);

    // 대시 중 반투명 + 무적 표시
    this.player.setAlpha(0.5);

    // 0.3초 후 대시 종료
    this.time.delayedCall(300, () => {
      this.isDashing = false;
      this.isInvincible = false;
      this.player.setAlpha(1);
    });

    // 쿨타임 후 다시 대시 가능
    this.time.delayedCall(this.dashCooldown, () => {
      this.canDash = true;
    });
  }

  update(time, delta) {
    if (this.isGameOver || this.isChoosingUpgrade) return;

    // 생존 시간 갱신
    this.survivalTime += delta / 1000;
    const minutes = Math.floor(this.survivalTime / 60);
    const seconds = Math.floor(this.survivalTime % 60);
    this.timerText.setText(
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );

    const speed = this.moveSpeed;
    this.player.body.setVelocity(0);

    if (this.isMobile && this.joystickActive) {
      // 조이스틱 입력으로 이동
      this.player.body.setVelocityX(this.joystickDirX * speed);
      this.player.body.setVelocityY(this.joystickDirY * speed);
    } else {
      // 키보드 입력으로 이동
      if (this.cursors.left.isDown) this.player.body.setVelocityX(-speed);
      else if (this.cursors.right.isDown) this.player.body.setVelocityX(speed);

      if (this.cursors.up.isDown) this.player.body.setVelocityY(-speed);
      else if (this.cursors.down.isDown) this.player.body.setVelocityY(speed);
    }

    // 마지막으로 움직인 방향 저장 (평타 기본 방향용)
    if (this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0) {
      const len = Math.sqrt(
        this.player.body.velocity.x ** 2 + this.player.body.velocity.y ** 2
      );
      this.lastDirX = this.player.body.velocity.x / len;
      this.lastDirY = this.player.body.velocity.y / len;
    }
    
    // 스페이스바 누르면 대시
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && this.canDash) {
      this.dash();
    }

    // 모든 몬스터가 플레이어를 향해 이동
    this.monsters.getChildren().forEach((monster) => {
      const chaseSpeed = monster.isRanged ? 60 : 100;
      this.physics.moveToObject(monster, this.player, chaseSpeed);
    });

    // 이름표 / 머리 위 체력바가 캐릭터를 따라다니게 함
    this.nameTag.setPosition(this.player.x, this.player.y - 45);
    this.headHpBarBg.setPosition(this.player.x, this.player.y - 32);
    this.headHpBar.setPosition(this.player.x - (22 - (22 * this.hp / this.maxHp)), this.player.y - 32);
    this.headHpBar.width = 44 * (this.hp / this.maxHp);
    
    // 화면 밖으로 나간 탄환 정리
    this.bullets.getChildren().forEach((b) => {
      if (b.x < -50 || b.x > this.W + 50 || b.y < -50 || b.y > this.H + 50) b.destroy();
    });
  }
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  input: {
    activePointers: 3
  },
  resolution: window.devicePixelRatio || 1,
  render: {
    antialias: true,
    roundPixels: false
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game-container'
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: MainScene
};

const game = new Phaser.Game(config);

// Vite가 코드를 새로고침할 때, 이전 게임을 완전히 정리하고 새로 시작하도록 함
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}

// 화면 회전 시, 약간의 지연 후 크기를 다시 계산 (모바일 브라우저 주소창 변화 대응)
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  }, 300);
});

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// 모바일에서 화면을 처음 터치하는 즉시 전체화면 전환 (브라우저 이벤트에 직접 연결)
function requestGameFullscreen() {
  const el = document.getElementById('game-container');
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
  }
}

document.getElementById('game-container').addEventListener(
  'touchend',
  function once() {
    requestGameFullscreen();
    document.getElementById('game-container').removeEventListener('touchend', once);
  },
  { once: true }
);