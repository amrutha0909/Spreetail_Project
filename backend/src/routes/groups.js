const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all group routes
router.use(authMiddleware);

// GET /api/groups — Get all groups the logged-in user is part of
router.get('/', async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: {
        memberships: {
          some: {
            userId: req.user.userId
          }
        }
      },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format response to make it cleaner
    const formattedGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      currency: group.currency,
      createdAt: group.createdAt,
      members: group.memberships.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt
      }))
    }));

    res.json(formattedGroups);
  } catch (error) {
    next(error);
  }
});

// POST /api/groups — Create a new group
router.post('/', async (req, res, next) => {
  try {
    const { name, description, currency } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Create group and add the creator as member
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name,
          description,
          currency: currency || 'INR'
        }
      });

      await tx.groupMembership.create({
        data: {
          groupId: g.id,
          userId: req.user.userId,
          joinedAt: new Date()
        }
      });

      return g;
    });

    res.status(201).json(group);
  } catch (error) {
    next(error);
  }
});

// GET /api/groups/:id — Get details of a specific group
router.get('/:id', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        memberships: {
          some: { userId: req.user.userId } // security check
        }
      },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const formatted = {
      id: group.id,
      name: group.name,
      description: group.description,
      currency: group.currency,
      createdAt: group.createdAt,
      members: group.memberships.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt
      }))
    };

    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/groups/:id — Edit group details
router.patch('/:id', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    const { name, description, currency } = req.body;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Verify membership
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: req.user.userId }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { name, description, currency }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/groups/:id — Delete group
router.delete('/:id', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Verify membership
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId: req.user.userId }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete group (Prisma cascade or delete memberships first depending on DB schema constraints)
    await prisma.$transaction([
      prisma.groupMembership.deleteMany({ where: { groupId } }),
      prisma.group.delete({ where: { id: groupId } })
    ]);

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/groups/:id/members — List members
router.get('/:id/members', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const members = memberships.map(m => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt
    }));

    res.json(members);
  } catch (error) {
    next(error);
  }
});

// POST /api/groups/:id/members — Add member with joinedAt date
router.post('/:id/members', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    const { userId, email, joinedAt } = req.body; // allow adding by email or userId

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Find user
    let targetUserId = userId;
    if (!targetUserId && email) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        return res.status(404).json({ error: 'User not found' });
      }
      targetUserId = u.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Either userId or email is required' });
    }

    // Check if membership already exists
    const existing = await prisma.groupMembership.findFirst({
      where: { groupId, userId: targetUserId }
    });

    if (existing) {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }

    const membership = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: targetUserId,
        joinedAt: joinedAt ? new Date(joinedAt) : new Date()
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(201).json({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/groups/:id/members/:userId — Update membership (e.g. set leftAt date)
router.patch('/:id/members/:userId', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const { leftAt } = req.body;

    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid group or user ID' });
    }

    // Find the membership. There could be multiple entries if join/leave history is stored,
    // but schema has unique constraint @@unique([groupId, userId, joinedAt]). We find the active one (leftAt is null).
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId, leftAt: null }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Active group membership not found' });
    }

    const updated = await prisma.groupMembership.update({
      where: { id: membership.id },
      data: {
        leftAt: leftAt ? new Date(leftAt) : new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
